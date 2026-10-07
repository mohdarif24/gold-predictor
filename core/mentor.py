"""The AI mentor: an LLM that comments on every new reading, for the super admin, in English and Bengali.

It is a guide, not an oracle. It sees only this system's own data (the snapshot below: prices, the tested chances, the
checklist, the drivers, news and events, and risk numbers computed here), never the internet. It must not invent
numbers: every number it writes is checked against the snapshot, an answer with unknown numbers is sent back once for a
rewrite, and if it still fails it is stored with a warning. Risk numbers (stop distance, position size) are computed in
code, never by the model. It lays out choices (stay out, hold, small position) and leaves the decision to the trader.
"""
import json
import re
import urllib.error
import urllib.request

import pandas as pd

from . import settings, store

KEY_DRIVERS = ["dxy", "real_yield", "us10y", "fed_funds", "breakeven", "vix", "gvz", "silver", "oil", "spx", "btc",
               "usdinr", "usdbdt", "epu_us", "gpr"]
RISK_PCT = 1.0  # risk at most 1% of the account per trade (the common professional rule)
OZ_PER_LOT = 100  # XAU/USD: one standard lot is 100 troy ounces (Exness and most brokers)

SYSTEM = (
    "You are a calm, experienced gold trading mentor talking to one trader. You guide; the trader decides.\n"
    "Rules you must follow:\n"
    "1. Use ONLY facts and numbers that appear in DATA. Never invent prices, levels, targets, news, events or dates. "
    "If something is not in DATA, say you do not know it.\n"
    "2. Copy numbers exactly as they appear in DATA (you may round to fewer decimals). Do not calculate new numbers.\n"
    "3. Be honest about the system's evidence: DATA.verdicts says whether any time window has a proven edge on locked "
    "tests. If none has, say plainly that the chances are close to a coin flip and that size must stay small or zero.\n"
    "4. Never promise or predict a result. Talk in scenarios: if this happens, then that.\n"
    "5. Risk: use only DATA.risk (stop distances and position sizes for 1% risk). If DATA.event_pause is set for a "
    "window, advise staying out of that window until after the event.\n"
    "6. Give choices, not orders: stay out, hold an existing position, or a small position with a stop, each with when "
    "it would make sense. End by reminding that the decision is theirs.\n"
    "Reply with JSON only, no markdown, in this shape: {\"en\": BODY, \"bn\": BODY} where BODY is "
    "{\"headline\": string (max 15 words), \"market\": [2-4 short strings: what DATA shows right now], "
    "\"scenarios\": [{\"if\": string, \"then\": string}] (2-3), \"risk\": [2-3 short strings], "
    "\"options\": [{\"choice\": \"stay out\" | \"hold\" | \"small position\", \"when\": string}], "
    "\"bottom_line\": string (1-2 sentences)}. The \"bn\" BODY says the same in simple Bengali "
    "(numbers may use Bengali or English digits)."
)

_NUM = re.compile(r"\d+(?:[.,]\d+)*")
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
# small numbers that are part of ordinary speech (time windows, counts, "1%" rule) and need no source
_ALWAYS_OK = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 24, 30, 48, 50, 60, 100, 1000}


def _numbers(text: str) -> list[float]:
    out = []
    for m in _NUM.findall(text.translate(_BN_DIGITS)):
        try:
            out.append(float(m.replace(",", "")))
        except ValueError:
            continue
    return out


def _allowed(snapshot) -> set:
    """Every number in the snapshot, in the forms a writer may use: as is, rounded, and as a percentage."""
    vals = set(_ALWAYS_OK)

    def walk(o):
        if isinstance(o, bool) or o is None:
            return
        if isinstance(o, (int, float)):
            for v in (o, o * 100, abs(o), abs(o) * 100):
                for d in (0, 1, 2, 3):
                    vals.add(round(v, d))
        elif isinstance(o, str):
            for n in _numbers(o):
                vals.add(n)
                vals.add(round(n))
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v)
    walk(snapshot)
    return vals


def unknown_numbers(comment, snapshot) -> list:
    """Numbers in the comment that do not appear in the snapshot (the hallucination check)."""
    ok = _allowed(snapshot)
    bad = []
    for n in _numbers(json.dumps(comment, ensure_ascii=False)):
        if n in ok or round(n) in ok or any(abs(n - a) <= max(0.006 * abs(a), 0.051) for a in ok if a):
            continue
        bad.append(n)
    return sorted(set(bad))


def _series_last(db, name: str):
    rows = db.execute("SELECT ts, value FROM series WHERE name = ? ORDER BY ts DESC LIMIT 21", (f"driver:{name}",)).fetchall()
    if not rows:
        return None
    v = [r["value"] for r in rows]
    out = {"last": round(v[0], 4), "as_of": str(rows[0]["ts"])[:10]}
    if len(v) > 1 and v[1]:
        out["change_1d_pct"] = round((v[0] / v[1] - 1) * 100, 2)
    if len(v) > 5 and v[5]:
        out["change_5d_pct"] = round((v[0] / v[5] - 1) * 100, 2)
    return out


def build_snapshot(db, name: str, cfg: dict, results: list) -> dict:
    """Everything the mentor may talk about, from this system's own data."""
    inst = cfg["instruments"][name]
    now = pd.Timestamp.now(tz="UTC")
    windows = []
    for r in results:
        if "p_up" not in r:
            continue
        study = store.load_research(db, name, r["horizon"]) or {}
        hold = study.get("holdout") or {}
        row = db.execute("SELECT shown_p_up, event FROM predictions WHERE instrument = ? AND horizon = ? AND bar_ts = ?",
                         (name, r["horizon"], r["bar_ts"])).fetchone()
        shown = row["shown_p_up"] if row and row["shown_p_up"] is not None else None
        windows.append({
            "window": r["horizon"], "price": round(r["price"], 2), "regime": r["regime"],
            "chance_higher_pct": None if shown is None else round(shown * 100),
            "signal": r["signal"], "event_pause": row["event"] if row else None,
            "tested_accuracy_pct": None if hold.get("accuracy") is None else round(hold["accuracy"] * 100, 1),
            "guessing_accuracy_pct": None if hold.get("baseline_accuracy") is None else round(hold["baseline_accuracy"] * 100, 1),
            "proven_edge": bool(hold.get("has_edge")),
            "atr_usd": round(r["atr"], 2),
        })
    price = windows[0]["price"] if windows else None

    candles = db.execute("SELECT ts, close FROM candles WHERE instrument = ? AND tf = 'H1' ORDER BY ts DESC LIMIT 25", (name,)).fetchall()
    moves = {}
    if candles:
        c = [r["close"] for r in candles]
        for label, k in (("1h", 1), ("4h", 4), ("24h", 24)):
            if len(c) > k and c[k]:
                moves[f"change_{label}_pct"] = round((c[0] / c[k] - 1) * 100, 2)

    card = store.load_scorecard(db, name, "1d")
    checklist = None
    if card:
        checklist = {"leaning": card.get("direction"), "factors_net": card.get("net"),
                     "factors": {k: ("up" if v > 0 else "down" if v < 0 else "neutral") for k, v in (card.get("now") or {}).items()}}

    since = (now - pd.Timedelta(hours=24)).isoformat()
    news = [{"title": r["title"], "mood": "good for gold" if r["sentiment"] >= 0.2 else "bad for gold" if r["sentiment"] <= -0.2 else "neutral",
             "impact": r["impact"]}
            for r in db.execute("SELECT title, sentiment, impact FROM news WHERE published >= ? ORDER BY published DESC LIMIT 8",
                                (since,)).fetchall()]
    events = [{"when_utc": r["ts"], "title": r["title"], "impact": r["impact"], "forecast": r["forecast"], "previous": r["previous"]}
              for r in db.execute("SELECT ts, title, impact, forecast, previous FROM events WHERE country = 'USD' AND ts >= ? AND ts <= ? "
                                  "ORDER BY ts LIMIT 6", (now.isoformat(timespec="minutes"),
                                                          (now + pd.Timedelta(hours=48)).isoformat(timespec="minutes"))).fetchall()]
    drivers = {k: v for k in KEY_DRIVERS if (v := _series_last(db, k))}

    # risk numbers, computed here so the model never does arithmetic: a stop of sl_atr x ATR, and the size that loses
    # exactly 1% of a 1,000-dollar account if that stop is hit
    sl = cfg["shadow"]["sl_atr"]
    risk = {"rule": f"risk at most {RISK_PCT:g}% of the account on one trade", "per_window": []}
    for w in windows:
        stop = round(sl * w["atr_usd"], 2)
        if stop > 0:
            oz = round((1000 * RISK_PCT / 100) / stop, 3)
            risk["per_window"].append({"window": w["window"], "stop_distance_usd": stop, "account_usd": 1000,
                                       "risk_usd": round(1000 * RISK_PCT / 100, 2), "size_oz": oz,
                                       "size_lots": round(oz / OZ_PER_LOT, 4)})
    return {
        "instrument": inst["label"], "time_utc": now.isoformat(timespec="minutes"), "price": price, "recent_moves": moves,
        "windows": windows, "checklist_1d": checklist, "drivers": drivers, "news_24h": news, "us_events_next_48h": events,
        "verdicts": {"any_proven_edge": any(w["proven_edge"] for w in windows)}, "risk": risk,
    }


def _ask(cfg_llm: dict, messages: list, db) -> str:
    body = {"model": cfg_llm["model"], "temperature": 0, "max_tokens": 2500, "messages": messages}
    req = urllib.request.Request(cfg_llm["url"], data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {cfg_llm['key']}", "Content-Type": "application/json"})
    status, raw = None, ""
    with settings.Timer() as tm:
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                status, raw = r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read().decode("utf-8", "replace")
        except Exception as e:
            settings.log(db, "llm:mentor", cfg_llm["url"], cfg_llm["model"], ok=False, request=messages[-1]["content"],
                         error=f"{type(e).__name__}: {e}")
            raise
    ok = status == 200
    settings.log(db, "llm:mentor", cfg_llm["url"], cfg_llm["model"], ok=ok, status=status, ms=tm.ms,
                 request=messages[-1]["content"], response=raw, error="" if ok else f"HTTP {status}")
    if not ok:
        raise RuntimeError(f"HTTP {status}")
    return json.loads(raw)["choices"][0]["message"]["content"]


def parse(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    obj = json.loads(text[start:end + 1])
    if not isinstance(obj, dict) or not {"en", "bn"} <= set(obj):
        raise ValueError("the answer is missing the en / bn parts")
    for lang in ("en", "bn"):
        if not isinstance(obj[lang], dict) or not obj[lang].get("headline"):
            raise ValueError(f"the {lang} part has no headline")
    return obj


def comment(db, name: str, cfg: dict, results: list, ask=_ask) -> dict | None:
    """Write and store one mentor comment for this reading. Returns it, or None when no AI model is configured."""
    llm = settings.llm_config(db)
    if not llm:
        return None
    snap = build_snapshot(db, name, cfg, results)
    data = json.dumps(snap, ensure_ascii=False, default=str)
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": "DATA:\n" + data}]
    body = parse(ask(llm, messages, db))
    issues = unknown_numbers(body, snap)
    if issues:  # one rewrite, naming the numbers that are not in the data
        messages += [{"role": "assistant", "content": json.dumps(body, ensure_ascii=False)},
                     {"role": "user", "content": "These numbers are not in DATA: " + ", ".join(f"{n:g}" for n in issues)
                      + ". Rewrite the whole answer using only numbers that appear in DATA. JSON only."}]
        body = parse(ask(llm, messages, db))
        issues = unknown_numbers(body, snap)
    db.execute("INSERT INTO mentor_comments(ts, instrument, model, body, snapshot, grounded, issues) VALUES(?,?,?,?,?,?,?)",
               (store.now_iso(), name, llm["model"], json.dumps(body, ensure_ascii=False), data, int(not issues),
                ", ".join(f"{n:g}" for n in issues)))
    db.execute("DELETE FROM mentor_comments WHERE instrument = ? AND id <= (SELECT COALESCE(MAX(id), 0) FROM mentor_comments "
               "WHERE instrument = ?) - 500", (name, name))
    db.commit()
    return {"body": body, "grounded": not issues, "issues": issues}
