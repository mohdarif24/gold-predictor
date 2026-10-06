"""Inputs must carry the date they became public. These tests pin that down for each outside source."""
import numpy as np
import pandas as pd
import pytest

from core import sources
from core.features import build_features
from tests.test_core import synthetic


class FakeResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


class FakeClient:
    def __init__(self, text=None, fail=False):
        self.text, self.fail, self.calls = text, fail, []

    def get(self, url, params=None, **kw):
        self.calls.append(params)
        if self.fail:
            raise ConnectionError("offline")
        return FakeResponse(self.text)


CSV = "observation_date,DFII10\n2026-09-28,1.90\n2026-09-29,.\n2026-09-30,2.10\n"


def test_fred_values_are_moved_forward_by_their_publication_lag(tmp_path):
    out = sources.load_fred({"real_yield": {"id": "DFII10", "lag": 2}}, str(tmp_path), FakeClient(CSV))
    s = out["real_yield"]
    assert list(s.index.strftime("%Y-%m-%d")) == ["2026-09-30", "2026-10-02"]  # the "." gap is dropped, 28th+2, 30th+2
    assert list(s.values) == [1.90, 2.10]


def test_fred_falls_back_to_the_cached_copy_and_skips_what_it_never_had(tmp_path):
    spec = {"real_yield": {"id": "DFII10", "lag": 1}, "never": {"id": "NOPE", "lag": 1}}
    sources.load_fred({"real_yield": spec["real_yield"]}, str(tmp_path), FakeClient(CSV))  # fills the cache
    out = sources.load_fred(spec, str(tmp_path), FakeClient(fail=True))
    assert list(out) == ["real_yield"] and len(out["real_yield"]) == 2


def test_rate_series_change_is_a_difference_not_a_percentage():
    df = synthetic(900, tf_min=1440)
    idx = pd.date_range(df.index[0] - pd.Timedelta(days=400), df.index[-1], freq="D")
    ry = pd.Series(np.linspace(-0.5, 0.5, len(idx)), index=idx)          # crosses zero: a % change would explode
    px = pd.Series(np.linspace(100, 150, len(idx)), index=idx)
    f = build_features(df, "D1", drivers={"real_yield": ry, "silver": px})
    assert f["real_yield_ret1"].abs().max() < 0.01                       # about one step of 1/len, not an explosion
    assert 0 < f["silver_ret1"].dropna().iloc[-1] < 0.01                 # prices still use percentage change


def test_cot_is_known_from_the_saturday_after_the_tuesday_it_describes():
    raw = pd.DataFrame({"report_date": pd.to_datetime(["2026-09-22", "2026-09-29"]), "mm_long": [300, 400], "mm_short": [100, 100],
                        "pm_long": [50, 50], "pm_short": [150, 150], "oi": [1000, 1000]})
    f = sources.cot_features(raw)
    assert list(f.index.strftime("%Y-%m-%d")) == ["2026-09-26", "2026-10-03"]
    days = pd.DatetimeIndex(["2026-10-02", "2026-10-05"])  # Friday of release week, then Monday
    df = pd.DataFrame({"open": 1.0, "high": 1.1, "low": 0.9, "close": 1.0, "volume": 1.0}, index=days)
    got = build_features(df, "D1", cot=f)["cot_mm_net"]
    assert got.loc["2026-10-02"] == pytest.approx(0.2)    # still the 22 Sept report: (300-100)/1000
    assert got.loc["2026-10-05"] == pytest.approx(0.3)    # the 29 Sept report is usable by Monday


def test_calendar_features_on_known_dates():
    c = sources.calendar_features(pd.DatetimeIndex(["2026-10-01", "2026-10-02", "2026-10-03"]))
    assert list(c["cal_days_to_nfp"]) == [1, 0, 34]       # first Friday of October 2026 is the 2nd
    assert list(c["cal_days_to_opex"]) == [15, 14, 13]    # third Friday is the 16th
    assert c["cal_days_to_month_end"].iloc[0] == 30
