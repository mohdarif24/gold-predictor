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


def test_clamped():
    assert chance_up(_card("up", 0.99, 40), None, 0.5)["p_up"] == 0.95
