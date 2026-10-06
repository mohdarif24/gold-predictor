"""Free news and event feeds for gold, scored for what they mean for the gold price.

Sources (no key needed): Google News RSS searches, and a public economic-calendar feed.
Scoring: transparent keyword rules always work offline. If an OpenAI-compatible LLM is configured it scores the
headlines instead (any free provider works: GitHub Models, Groq, OpenRouter, Gemini...), and any failure falls back
to the rules. The LLM is used only when LLM_API_KEY is set; LLM_API_URL and LLM_MODEL pick the provider.

A sentiment score runs from -1 (bearish for gold) to +1 (bullish for gold).
"""
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import numpy as np
import pandas as pd

QUERIES = {
    "gold": "gold price",
    "rates": "federal reserve interest rates",
    "inflation": "inflation CPI report",
    "dollar": "US dollar index",
    "geopolitics": "geopolitical tension safe haven",
    "demand": "central bank gold buying",
}
TOPICS = ["rates", "inflation", "dollar", "geopolitics", "demand", "price", "other"]
CAL_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
UA = {"User-Agent": "Mozilla/5.0"}

# (pattern, weight). Positive = good for gold.
_MACRO = [
    (r"rate[- ]cut|cuts? (interest )?rates|dovish|easing|rate[- ]cut bets", +1.0),
    (r"rate[- ]hike|hikes? (interest )?rates|hawkish|rate[- ]hike bets|tighten", -1.0),
    (r"(weaker|weakening|falling) dollar|dollar (falls?|slips?|weakens?|drops?|slides?)", +0.8),
    (r"(stronger|strengthening|firm|rising) dollar|dollar (rises?|gains?|surges?|firms?|climbs?|strengthens?)", -0.8),
    (r"yields? (fall|drop|slip|slide|decline|retreat|ease)", +0.8),
    (r"yields? (rise|jump|climb|surge|elevated|higher|spike)", -0.8),
    (r"safe[- ]haven (demand|buying|bid|flows?)", +0.8),
    (r"geopolitical|war\b|conflict|tension|missile|attack|sanction", +0.5),
    (r"central banks? (buy|buying|purchas|accumulat)", +0.8),
    (r"etf (inflows?|buying)|inflows? into gold", +0.6),
    (r"etf (outflows?|selling)|outflows? from gold", -0.6),
    (r"inflation (rises?|jumps?|hotter|accelerat|worr|fears?)|hotter[- ]than[- ]expected inflation", +0.5),
    (r"(cut|reduce|trim)\w* (their )?(net )?long|speculators (cut|reduce|trim|sell)", -0.6),
    (r"profit[- ]taking|sell[- ]?off", -0.5),
]
_PRICE = [  # only counted when the headline is about gold itself
    (r"record high|all[- ]time high|multi[- ]\w+ high|hits? .{0,12}high", +1.0),
    (r"\b(rall(y|ies)|surg(e|es|ed)|jump(s|ed)?|climb(s|ed)?|gain(s|ed)?|rise(s)?|rose|higher|advance(s|d)?|rebound(s|ed)?)\b", +0.7),
    (r"(week|month|year)[- ]low|lowest|slump|tumbl|plung|slid|slide|slip(s|ped)?|fall(s|en)?\b|fell|drop(s|ped)?|declin|lower|retreat|under pressure|loses|losses|weaker", -0.9),
]
_GOLD = re.compile(r"\b(gold|bullion|xau|precious metals?)\b", re.I)
_TOPIC_RULES = [
    ("rates", r"fed\b|federal reserve|fomc|powell|interest rate|rate (cut|hike)|yields?|treasur"),
    ("inflation", r"inflation|cpi\b|pce\b|price index|consumer prices"),
    ("dollar", r"dollar|dxy|greenback|currency"),
    ("geopolitics", r"war\b|conflict|tension|geopolit|missile|sanction|attack|safe[- ]haven"),
    ("demand", r"central banks?|etf|jewell?ery|demand|imports?|china|india|buying"),
    ("price", r"gold|bullion|xau"),
]
_HIGH = re.compile(r"fed\b|fomc|powell|cpi\b|nfp|jobs report|payrolls|rate (decision|hike|cut)|war\b|attack|record|crash|plunge|surge", re.I)


def score_rules(title: str) -> dict:
    """Explainable offline scoring of one headline."""
    t = title.lower()
    s = sum(w for pat, w in _MACRO if re.search(pat, t))
    is_gold = bool(_GOLD.search(title))
    if is_gold:
        s += sum(w for pat, w in _PRICE if re.search(pat, t))
    sentiment = float(np.clip(s / 2.0, -1, 1))
    topic = next((name for name, pat in _TOPIC_RULES if re.search(pat, t)), "other")
    impact = "high" if _HIGH.search(title) else ("medium" if is_gold else "low")
    return {"sentiment": round(sentiment, 3), "topic": topic, "impact": impact, "summary": None, "scorer": "rules"}


def label(sentiment: float) -> str:
    return "bullish" if sentiment >= 0.2 else "bearish" if sentiment <= -0.2 else "neutral"


# ------------------------------------------------------------------------------------------------------ fetching
def _get(url: str, timeout: int = 30) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def parse_google_rss(xml_bytes: bytes) -> list:
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.findall(".//item"):
        title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
        source = (it.findtext("source") or "").strip()
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3]
        try:
            pub = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).isoformat(timespec="seconds")
        except (TypeError, ValueError):
            continue
        if title:
            out.append({"id": hashlib.sha1((link or title).encode()).hexdigest()[:20], "published": pub,
                        "source": source or "news", "title": title, "url": link})
    return out


def fetch_google_news(query: str, when: str = "2d") -> list:
    q = urllib.parse.quote(f"{query} when:{when}")
    return parse_google_rss(_get(f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"))


# ------------------------------------------------------------------------------------------------------ LLM scoring
def llm_config():
    key = os.getenv("LLM_API_KEY")
    if not key:
        return None
    # `or` (not a default argument) because CI passes unset secrets as empty strings
    return {"key": key, "url": os.getenv("LLM_API_URL") or "https://models.github.ai/inference/chat/completions",
            "model": os.getenv("LLM_MODEL") or "openai/gpt-4o-mini"}


_PROMPT = (
    "You read gold-market headlines. For each numbered headline return what it implies for the GOLD PRICE over the next "
    "few days. Reply with a JSON array only, one object per headline: "
    '{"i": number, "sentiment": number from -1 (bearish for gold) to 1 (bullish), "topic": one of '
    + json.dumps(TOPICS) + ', "impact": "high"|"medium"|"low", "summary": at most 18 words}. Headlines:\n'
)


def parse_llm_json(text: str, n: int) -> dict:
    """Validate the model's answer; anything malformed is dropped (those headlines fall back to the rules)."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    arr = json.loads(text)
    out = {}
    for o in arr if isinstance(arr, list) else []:
        try:
            i = int(o["i"])
            if not 0 <= i < n:
                continue
            out[i] = {"sentiment": float(np.clip(float(o["sentiment"]), -1, 1)),
                      "topic": o["topic"] if o.get("topic") in TOPICS else "other",
                      "impact": o["impact"] if o.get("impact") in ("high", "medium", "low") else "low",
                      "summary": str(o.get("summary", ""))[:200] or None}
        except (KeyError, TypeError, ValueError):
            continue
    return out


def score_llm(titles: list, cfg: dict, timeout: int = 60) -> dict:
    body = {"model": cfg["model"], "temperature": 0, "max_tokens": 2500,
            "messages": [{"role": "user", "content": _PROMPT + "\n".join(f"{i}. {t}" for i, t in enumerate(titles))}]}
    req = urllib.request.Request(cfg["url"], data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {cfg['key']}", "Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req, timeout=timeout).read())
    return parse_llm_json(resp["choices"][0]["message"]["content"], len(titles))


def score_articles(items: list) -> list:
    """Attach sentiment, topic and impact to each article (LLM when configured and working, otherwise the rules)."""
    cfg, llm = llm_config(), {}
    if cfg and items:
        for i in range(0, len(items), 25):
            batch = items[i:i + 25]
            try:
                got = score_llm([a["title"] for a in batch], cfg)
                llm.update({i + k: v for k, v in got.items()})
            except Exception as e:  # network, quota, bad JSON: the rules cover it
                print(f"LLM scoring skipped for a batch: {type(e).__name__}: {str(e)[:100]}", flush=True)
    out = []
    for i, a in enumerate(items):
        s = ({**llm[i], "scorer": f"llm:{cfg['model']}"} if i in llm else score_rules(a["title"]))
        out.append({**a, **s})
    return out


# ------------------------------------------------------------------------------------------------------ storing
def store_articles(db, items: list, use_llm: bool = True) -> int:
    """Score and store articles not seen before. Returns how many were new."""
    if not items:
        return 0
    have = {r["id"] for r in db.execute("SELECT id FROM news WHERE id IN (%s)" % ",".join("?" * len(items)),
                                         [a["id"] for a in items]).fetchall()}
    fresh = [a for a in items if a["id"] not in have]
    scored = score_articles(fresh) if use_llm else [{**a, **score_rules(a["title"])} for a in fresh]
    for a in scored:
        db.execute(
            "INSERT INTO news(id, published, source, title, url, topic, sentiment, impact, summary, scorer) "
            "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
            (a["id"], a["published"], a["source"], a["title"], a["url"], a["topic"], a["sentiment"], a["impact"],
             a["summary"], a["scorer"]))
    db.commit()
    return len(fresh)


def refresh_news(db, queries: dict | None = None, fetch=fetch_google_news, pause: float = 1.0) -> int:
    """Fetch, score and store new headlines. Returns how many were new."""
    seen, items = set(), []
    for q in (queries or QUERIES).values():
        try:
            for a in fetch(q):
                if a["id"] not in seen:
                    seen.add(a["id"])
                    items.append(a)
        except Exception as e:
            print(f"news query {q!r} skipped: {type(e).__name__}: {str(e)[:80]}", flush=True)
        time.sleep(pause)
    return store_articles(db, items)


def fetch_google_day(query: str, day) -> list:
    """Headlines published on one calendar day (Google News supports after:/before: operators)."""
    nxt = (pd.Timestamp(day) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    q = urllib.parse.quote(f"{query} after:{pd.Timestamp(day):%Y-%m-%d} before:{nxt}")
    return parse_google_rss(_get(f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"))


def backfill_news(db, start, end, query: str = "gold price", fetch=fetch_google_day, pause: float = 1.0,
                  max_failures: int = 5, log=print, newest_first: bool = True) -> dict:
    """Build a history of daily headlines so news mood can be tested as a model input like any other input.

    Resumable: each finished day is recorded, so a stopped run continues where it left off. Uses the keyword rules
    (never an AI model: thousands of calls). Stops politely after repeated failures, such as Google rate limiting."""
    marker = f"backfill:{query}"
    done = {r["ts"] for r in db.execute("SELECT ts FROM series WHERE name=?", (marker,)).fetchall()}
    days = [d.strftime("%Y-%m-%d") for d in pd.date_range(start, end, freq="D") if d.strftime("%Y-%m-%d") not in done]
    if newest_first:  # the recent years matter most, so a run that is stopped early still leaves useful data
        days.reverse()
    new = finished = 0
    for day in days:
        items = None
        for attempt in range(1, max_failures + 1):  # retry the same day, with growing pauses
            try:
                items = fetch(query, day)
                break
            except Exception as e:
                log(f"  {day}: {type(e).__name__}: {str(e)[:60]} (attempt {attempt}/{max_failures})")
                time.sleep(min(pause * 10 * attempt, 90))
        if items is None:  # still failing (for example rate limited): stop, a later run resumes here
            return {"finished_days": finished, "new_articles": new, "stopped_at": day, "remaining": len(days) - finished}
        new += store_articles(db, items, use_llm=False)
        db.execute("INSERT INTO series(name, ts, value) VALUES(?,?,?) ON CONFLICT(name, ts) DO UPDATE SET value=excluded.value",
                   (marker, day, float(len(items))))
        db.commit()
        finished += 1
        if finished % 50 == 0:
            log(f"  {day}: {finished} days done, {new} articles")
        time.sleep(pause)
    return {"finished_days": finished, "new_articles": new, "stopped_at": None, "remaining": 0}


def news_features(db) -> pd.DataFrame:
    """Daily news mood from what has been collected so far, indexed by the day it covers.
    History only exists from the day collection began, so models see these inputs as missing before then."""
    rows = db.execute("SELECT published, sentiment, impact FROM news").fetchall()
    if not rows:
        return pd.DataFrame()
    d = pd.DataFrame([dict(r) for r in rows])
    d["day"] = pd.to_datetime(d["published"], utc=True).dt.tz_localize(None).dt.normalize()
    g = d.groupby("day")
    f = pd.DataFrame({"news_sent_mean": g["sentiment"].mean(), "news_count": g["sentiment"].size(),
                      "news_high_share": g["impact"].apply(lambda s: float((s == "high").mean()))})
    f["news_sent_3d"] = f["news_sent_mean"].rolling(3, min_periods=1).mean()
    f.index.name = "available"
    return f


# ------------------------------------------------------------------------------------------------------ events
_EVENT_WORDS = re.compile(r"fomc|fed|powell|cpi|ppi|pce|non-?farm|nfp|payroll|unemployment|jobless|gdp|retail sales|"
                          r"rate decision|interest rate|ism|inflation|opec|speaks", re.I)


def parse_events(raw: list) -> list:
    out = []
    for e in raw:
        country, impact, title = e.get("country", ""), e.get("impact", ""), e.get("title", "")
        if impact not in ("High", "Medium") and not (impact == "Low" and False):
            continue
        if country not in ("USD", "CNY", "EUR", "All") and impact != "High":
            continue
        if country == "USD" or _EVENT_WORDS.search(title) or impact == "High":
            try:
                ts = datetime.fromisoformat(e["date"]).astimezone(timezone.utc).isoformat(timespec="minutes")
            except (KeyError, ValueError):
                continue
            out.append({"id": hashlib.sha1(f"{ts}{country}{title}".encode()).hexdigest()[:20], "ts": ts, "country": country,
                        "title": title, "impact": impact.lower(), "forecast": e.get("forecast") or None,
                        "previous": e.get("previous") or None})
    return out


def refresh_events(db, fetch=lambda: json.loads(_get(CAL_URL))) -> int:
    try:
        events = parse_events(fetch())
    except Exception as e:
        print(f"economic calendar skipped: {type(e).__name__}: {str(e)[:80]}", flush=True)
        return 0
    for ev in events:
        db.execute(
            "INSERT INTO events(id, ts, country, title, impact, forecast, previous) VALUES(?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET forecast=excluded.forecast, previous=excluded.previous, impact=excluded.impact",
            (ev["id"], ev["ts"], ev["country"], ev["title"], ev["impact"], ev["forecast"], ev["previous"]))
    db.commit()
    return len(events)
