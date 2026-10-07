from core.public import chance_up


def _card(direction, total_rate, total_n, base=0.53):
    return {"direction": direction, "full": {"base_up": {"rate": base, "n": 2000},
                                             "total": {"rate": total_rate, "n": total_n}}}


def test_checklist_uses_hit_rate_in_its_direction():
    assert chance_up(_card("up", 0.61, 120), None, 0.5) == {"p_up": 0.61, "source": "checklist", "cases": 120}
    assert chance_up(_card("down", 0.58, 90), None, 0.5)["p_up"] == 0.42


def test_checklist_falls_back_to_base_rate_on_few_cases_or_no_direction():
    assert chance_up(_card("up", 0.9, 12), None, 0.5) == {"p_up": 0.53, "source": "checklist", "cases": 2000}
    assert chance_up(_card("none", None, 0), None, 0.5)["p_up"] == 0.53


def test_intraday_maps_model_probability_to_calibration():
    study = {"holdout": {"calibration": [{"pred": 0.45, "actual": 0.49, "n": 200},
                                         {"pred": 0.55, "actual": 0.52, "n": 150},
                                         {"pred": 0.7, "actual": 0.8, "n": 5}]}}
    assert chance_up(None, study, 0.56) == {"p_up": 0.52, "source": "model_calibrated", "cases": 150}
    thin = chance_up(None, study, 0.72)  # nearest bin too small: weighted base rate instead
    assert thin["source"] == "base_rate" and thin["cases"] == 355
    assert chance_up(None, None, 0.9) == {"p_up": 0.5, "source": "base_rate", "cases": 0}


def test_big_us_news_pauses_the_short_windows(tmp_path):
    from datetime import datetime, timezone

    from core import store
    from core.public import event_pause

    db = store.connect(str(tmp_path / "t.db"))
    rows = [("a", "2026-10-09T12:30+00:00", "USD", "Non-Farm Employment Change", "high"),
            ("b", "2026-10-09T09:00+00:00", "EUR", "German CPI", "high"),
            ("c", "2026-10-09T14:00+00:00", "USD", "Factory Orders", "medium")]
    for r in rows:
        db.execute("INSERT INTO events(id, ts, country, title, impact) VALUES(?,?,?,?,?)", r)
    db.commit()
    at = lambda h, m=0: datetime(2026, 10, 9, h, m, tzinfo=timezone.utc)  # noqa: E731
    assert event_pause(db, "30m", at(11))["title"] == "Non-Farm Employment Change"  # 90 minutes before
    assert event_pause(db, "1h", at(13, 15))["title"] == "Non-Farm Employment Change"  # 45 minutes after
    assert event_pause(db, "30m", at(8)) is None  # too early; the German release does not count
    assert event_pause(db, "1d", datetime(2026, 10, 8, 14, tzinfo=timezone.utc)) is not None  # within the next day
    assert event_pause(db, "1w", at(12)) is None  # every week has events: the weekly view is never paused
    assert event_pause(None, "30m") is None
    db.close()


def test_clamped():
    assert chance_up(_card("up", 0.99, 40), None, 0.5)["p_up"] == 0.95
