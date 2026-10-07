import json

import pytest
import yaml
from pathlib import Path

from core import mentor, settings, store

CFG = yaml.safe_load((Path(__file__).resolve().parents[1] / "config.yaml").read_text())


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "k")
    d = store.connect(str(tmp_path / "t.db"))
    d.execute("INSERT INTO predictions(created, instrument, horizon, tf, steps, bar_ts, price, atr, p_up, signal, regime, has_edge, "
              "model_version, reason, shown_p_up, event) VALUES('2026-10-07T10:00:00+00:00','xauusd_yf','1h','M15',4,'b1',4118.08,6.4,"
              "0.58,'WAIT','LOW_VOL',0,'v','r',0.47,NULL)")
    d.execute("INSERT INTO series(name, ts, value) VALUES('driver:dxy','2026-10-05',99.1),('driver:dxy','2026-10-06',99.6)")
    d.execute("INSERT INTO news(id, published, source, title, url, topic, sentiment, impact, summary, scorer) VALUES"
              f"('n1','{__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}','x','Fed signals patience','u','rates',-0.3,'high',NULL,'rules')")
    d.commit()
    yield d
    d.close()


RESULTS = [{"horizon": "1h", "bar_ts": "b1", "price": 4118.08, "atr": 6.4, "p_up": 0.58, "regime": "LOW_VOL", "signal": "WAIT", "is_new": True}]


def _answer(headline, market):
    body = {"headline": headline, "market": market, "scenarios": [{"if": "a", "then": "b"}], "risk": ["small"],
            "options": [{"choice": "stay out", "when": "now"}], "bottom_line": "You decide."}
    return json.dumps({"en": body, "bn": {**body, "headline": "বাংলা"}})


def test_snapshot_holds_only_system_data_and_computes_risk_in_code(db):
    s = mentor.build_snapshot(db, "xauusd_yf", CFG, RESULTS)
    w = s["windows"][0]
    assert w["chance_higher_pct"] == 47 and w["price"] == 4118.08 and w["proven_edge"] is False
    r = s["risk"]["per_window"][0]
    assert r["stop_distance_usd"] == pytest.approx(1.5 * 6.4)  # sl_atr x ATR
    assert r["size_oz"] == pytest.approx(10 / (1.5 * 6.4), abs=1e-3)  # loses $10 (1% of $1,000) at the stop
    assert s["drivers"]["dxy"]["change_1d_pct"] == pytest.approx((99.6 / 99.1 - 1) * 100, abs=0.01)
    assert s["news_24h"][0]["mood"] == "bad for gold"
    assert s["verdicts"]["any_proven_edge"] is False


def test_grounded_comment_is_stored(db):
    calls = []

    def ask(llm, messages, d):
        calls.append(messages)
        return _answer("Gold at 4118.08, chance of higher 47%", ["Dollar index up 0.5% in a day"])

    out = mentor.comment(db, "xauusd_yf", CFG, RESULTS, ask=ask)
    assert out["grounded"] and len(calls) == 1
    row = db.execute("SELECT grounded, model, body FROM mentor_comments").fetchone()
    assert row["grounded"] == 1 and json.loads(row["body"])["en"]["headline"].startswith("Gold at")
    assert "Use ONLY facts and numbers that appear in DATA" in calls[0][0]["content"]


def test_invented_numbers_are_sent_back_once_then_flagged(db):
    answers = iter([_answer("Gold will hit 4300 by Friday", ["Target 4300"]),
                    _answer("Still 4300 target", ["Target 4300"])])
    calls = []

    def ask(llm, messages, d):
        calls.append(messages)
        return next(answers)

    out = mentor.comment(db, "xauusd_yf", CFG, RESULTS, ask=ask)
    assert len(calls) == 2 and "4300" in calls[1][-1]["content"]  # the rewrite request names the invented number
    assert not out["grounded"] and 4300 in out["issues"]
    assert db.execute("SELECT grounded, issues FROM mentor_comments").fetchone()["issues"] == "4300"


def test_fixed_after_rewrite_is_grounded(db):
    answers = iter([_answer("Gold will hit 4300", []), _answer("Gold near 4118", [])])
    out = mentor.comment(db, "xauusd_yf", CFG, RESULTS, ask=lambda *a: next(answers))
    assert out["grounded"]


def test_no_ai_model_means_no_comment(db, monkeypatch):
    monkeypatch.delenv("LLM_API_KEY")
    assert mentor.comment(db, "xauusd_yf", CFG, RESULTS, ask=lambda *a: pytest.fail("must not call")) is None


def test_bengali_digits_are_checked_too():
    snap = {"price": 4118.08}
    assert mentor.unknown_numbers({"bn": "সোনা ৪১১৮ ডলারে"}, snap) == []
    assert mentor.unknown_numbers({"bn": "লক্ষ্য ৪৩০০"}, snap) == [4300.0]
