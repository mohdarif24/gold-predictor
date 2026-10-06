import json

import pytest

from core import news

RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Gold Falls to Seven-Week Low as Rate-Hike Bets Rise - wsj.com</title><link>https://x/1</link>
<pubDate>Mon, 05 Oct 2026 06:42:58 GMT</pubDate><source url="https://wsj.com">wsj.com</source></item>
<item><title>Gold Rallies to Record High as Fed Rate Cut Bets Grow - Reuters</title><link>https://x/2</link>
<pubDate>Mon, 05 Oct 2026 07:00:00 GMT</pubDate><source url="https://r">Reuters</source></item>
<item><title>Current price of gold as of October 5, 2026 - Fortune</title><link>https://x/3</link>
<pubDate>Mon, 05 Oct 2026 13:14:00 GMT</pubDate><source url="https://f">Fortune</source></item>
<item><title>Item with a broken date</title><link>https://x/4</link><pubDate>not a date</pubDate></item>
</channel></rss>""".encode()


@pytest.mark.parametrize("title,expect", [
    ("Gold Falls to Seven-Week Low as Rate-Hike Bets Rise", "bearish"),
    ("Gold Under Pressure as Bond Yields and Dollar Stay Elevated, Speculators Cut Long Positions", "bearish"),
    ("Gold Rallies to Record High as Fed Rate Cut Bets Grow", "bullish"),
    ("Gold climbs as dollar slips and Treasury yields fall", "bullish"),
    ("Safe-haven demand lifts gold amid geopolitical tension", "bullish"),
    ("Current price of gold as of October 5, 2026", "neutral"),
    ("Local bakery wins award", "neutral"),
])
def test_rule_scorer_reads_gold_headlines(title, expect):
    assert news.label(news.score_rules(title)["sentiment"]) == expect


def test_price_words_only_count_when_the_headline_is_about_gold():
    assert news.score_rules("Tech stocks rally to record high")["sentiment"] == 0.0
    assert news.score_rules("Rate hike bets rise")["sentiment"] < 0  # macro words count either way


def test_topics_and_impact():
    a = news.score_rules("Fed Chair Powell signals rate hike")
    assert a["topic"] == "rates" and a["impact"] == "high"
    assert news.score_rules("Gold demand in India jumps")["topic"] == "demand"
    assert news.score_rules("Random headline")["impact"] == "low"


def test_rss_parsing_cleans_titles_and_skips_bad_items():
    items = news.parse_google_rss(RSS)
    assert len(items) == 3
    assert items[0]["title"] == "Gold Falls to Seven-Week Low as Rate-Hike Bets Rise" and items[0]["source"] == "wsj.com"
    assert items[0]["published"] == "2026-10-05T06:42:58+00:00" and len({i["id"] for i in items}) == 3


def test_llm_answer_is_validated_and_bad_rows_are_dropped():
    good = json.dumps([{"i": 0, "sentiment": 5, "topic": "rates", "impact": "high", "summary": "Fed hawkish"},
                       {"i": 1, "sentiment": "x"}, {"i": 9, "sentiment": 0.1}, {"sentiment": 0.2},
                       {"i": 2, "sentiment": -0.4, "topic": "nonsense", "impact": "huge"}])
    got = news.parse_llm_json("```json\n" + good + "\n```", 3)
    assert set(got) == {0, 2}
    assert got[0]["sentiment"] == 1.0  # clipped
    assert got[2]["topic"] == "other" and got[2]["impact"] == "low"
    with pytest.raises(json.JSONDecodeError):
        news.parse_llm_json("not json", 1)


def test_scoring_falls_back_to_rules_when_the_llm_fails(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setattr(news, "score_llm", lambda titles, cfg: (_ for _ in ()).throw(RuntimeError("quota")))
    out = news.score_articles([{"id": "1", "title": "Gold falls on rate hike bets"}])
    assert out[0]["scorer"] == "rules" and out[0]["sentiment"] < 0


def test_scoring_uses_the_llm_when_it_answers(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setattr(news, "score_llm", lambda titles, cfg: {0: {"sentiment": 0.9, "topic": "rates", "impact": "high", "summary": "s"}})
    out = news.score_articles([{"id": "1", "title": "x"}, {"id": "2", "title": "Gold falls on rate hike bets"}])
    assert out[0]["scorer"].startswith("llm:") and out[0]["sentiment"] == 0.9
    assert out[1]["scorer"] == "rules"  # the LLM skipped it


def test_refresh_stores_each_headline_once_and_builds_daily_features(db):
    fetch = lambda q: news.parse_google_rss(RSS)
    assert news.refresh_news(db, {"a": "x", "b": "y"}, fetch=fetch, pause=0) == 3
    assert news.refresh_news(db, {"a": "x"}, fetch=fetch, pause=0) == 0  # nothing new the second time
    assert db.execute("SELECT COUNT(*) AS n FROM news").fetchone()["n"] == 3
    f = news.news_features(db)
    assert list(f.index.astype(str)) == ["2026-10-05"]
    assert set(f.columns) == {"news_sent_mean", "news_sent_3d", "news_high_share"}  # no headline count: it tracks the calendar


def test_events_are_filtered_and_stored(db):
    raw = [{"title": "FOMC Meeting Minutes", "country": "USD", "date": "2026-10-08T14:00:00-04:00", "impact": "High", "forecast": "", "previous": ""},
           {"title": "Bank Holiday", "country": "JPY", "date": "2026-10-08T00:00:00-04:00", "impact": "Low"},
           {"title": "CPI m/m", "country": "USD", "date": "2026-10-14T08:30:00-04:00", "impact": "High", "forecast": "0.3%", "previous": "0.2%"},
           {"title": "Spanish Unemployment", "country": "EUR", "date": "2026-10-09T04:00:00-04:00", "impact": "Medium"}]
    assert news.refresh_events(db, fetch=lambda: raw) == 3
    assert news.refresh_events(db, fetch=lambda: raw) == 3
    rows = db.execute("SELECT title, impact, ts FROM events ORDER BY ts").fetchall()
    assert [r["title"] for r in rows] == ["FOMC Meeting Minutes", "Spanish Unemployment", "CPI m/m"]
    assert rows[0]["ts"] == "2026-10-08T18:00+00:00"


def test_llm_is_off_unless_a_key_is_set_and_blank_ci_values_use_defaults(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.setenv("GITHUB_TOKEN", "present-but-not-used")
    assert news.llm_config() is None
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_API_URL", "")   # CI passes unset secrets as empty strings
    monkeypatch.setenv("LLM_MODEL", "")
    cfg = news.llm_config()
    assert cfg["url"].startswith("https://models.github.ai") and cfg["model"] == "openai/gpt-4o-mini"


def test_backfill_is_resumable_and_stops_politely_on_repeated_failures(db):
    calls = []

    def fetch(query, day):
        calls.append(day)
        if day == "2026-01-03" and len([c for c in calls if c == day]) <= 5:
            raise RuntimeError("429 too many requests")
        return [{"id": f"id-{day}", "published": f"{day}T08:00:00+00:00", "source": "s", "title": f"Gold falls {day}", "url": f"https://x/{day}"}]

    out = news.backfill_news(db, "2026-01-01", "2026-01-05", fetch=fetch, pause=0, max_failures=3, log=lambda *_: None, newest_first=False)
    assert out["finished_days"] == 2 and out["stopped_at"] == "2026-01-03" and out["remaining"] == 3
    again = news.backfill_news(db, "2026-01-01", "2026-01-05", fetch=fetch, pause=0, max_failures=9, log=lambda *_: None, newest_first=False)
    assert again["stopped_at"] is None and again["finished_days"] == 3        # only the unfinished days are fetched
    assert calls.count("2026-01-01") == 1 and calls.count("2026-01-02") == 1
    assert db.execute("SELECT COUNT(*) AS n FROM news").fetchone()["n"] == 5
    assert set(news.news_features(db).index.strftime("%Y-%m-%d")) == {f"2026-01-0{d}" for d in range(1, 6)}
    assert db.execute("SELECT scorer FROM news LIMIT 1").fetchone()["scorer"] == "rules"


def test_backfill_defaults_to_newest_first(db):
    order = []
    news.backfill_news(db, "2026-01-01", "2026-01-03", fetch=lambda q, d: order.append(d) or [], pause=0, log=lambda *_: None)
    assert order == ["2026-01-03", "2026-01-02", "2026-01-01"]
