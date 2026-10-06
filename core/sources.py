"""Free external inputs beyond prices: CFTC positioning (COT) and calendar effects.

Every series carries the date it became PUBLIC, not the date it describes, so a model never sees it early.
"""
import io
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

COT_URL = "https://www.cftc.gov/files/dea/history/fut_disagg_txt_{year}.zip"
COT_HIST_URL = "https://www.cftc.gov/files/dea/history/fut_disagg_txt_hist_2006_2016.zip"  # one file for 2006-2016
GOLD_CONTRACT = "088691"  # GOLD - COMMODITY EXCHANGE INC.
COT_COLS = {
    "Report_Date_as_YYYY-MM-DD": "report_date",
    "M_Money_Positions_Long_All": "mm_long",
    "M_Money_Positions_Short_All": "mm_short",
    "Prod_Merc_Positions_Long_All": "pm_long",
    "Prod_Merc_Positions_Short_All": "pm_short",
    "Open_Interest_All": "oi",
}


def _download(url: str) -> pd.DataFrame:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=90).read()
    z = zipfile.ZipFile(io.BytesIO(raw))
    df = pd.read_csv(z.open(z.namelist()[0]), low_memory=False)
    df = df[df["CFTC_Contract_Market_Code"].astype(str).str.strip() == GOLD_CONTRACT]
    return df[list(COT_COLS)].rename(columns=COT_COLS)


def load_cot_raw(data_dir: str = "data", first_year: int = 2006) -> pd.DataFrame:
    """Weekly gold futures positioning. 2006-2016 come as one file; later years one file each (current year refreshed)."""
    cache = Path(data_dir) / "cot_gold"
    cache.mkdir(parents=True, exist_ok=True)
    this_year = date.today().year
    jobs = [("hist", COT_HIST_URL, False)] + [(str(y), COT_URL.format(year=y), y == this_year) for y in range(2017, this_year + 1)]
    parts = []
    for name, url, refresh in jobs:
        f = cache / f"{name}.parquet"
        if f.exists() and not refresh:
            parts.append(pd.read_parquet(f))
            continue
        try:
            d = _download(url)
        except Exception as e:  # offline, or a year not published yet: fall back to what we cached
            if f.exists():
                parts.append(pd.read_parquet(f))
            else:
                print(f"warning: COT {name} unavailable: {e}")
            continue
        d.to_parquet(f)
        parts.append(d)
    if not parts:
        return pd.DataFrame()
    df = pd.concat(parts)
    df["report_date"] = pd.to_datetime(df["report_date"])
    df = df.drop_duplicates("report_date").sort_values("report_date")
    return df[df["report_date"].dt.year >= first_year].reset_index(drop=True)


def cot_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Positioning features indexed by the day they become public.

    The report describes Tuesday; the CFTC publishes it Friday afternoon. We treat it as known from the Saturday
    after (report date + 4 days), so even a Friday bar never sees it.
    """
    if raw.empty:
        return pd.DataFrame()
    r = raw.copy()
    oi = r["oi"].replace(0, np.nan)
    f = pd.DataFrame(index=pd.DatetimeIndex(r["report_date"] + pd.Timedelta(days=4), name="available"))
    mm = ((r["mm_long"] - r["mm_short"]) / oi).values
    pm = ((r["pm_long"] - r["pm_short"]) / oi).values
    f["cot_mm_net"] = mm                                            # speculators' net position, share of open interest
    f["cot_pm_net"] = pm                                            # producers/merchants (hedgers)
    f["cot_mm_chg4"] = pd.Series(mm).diff(4).values                 # 4-week change
    f["cot_mm_rank3y"] = pd.Series(mm).rolling(156, min_periods=52).rank(pct=True).values
    f["cot_oi_chg4"] = pd.Series(r["oi"].values).pct_change(4).values
    return f


def calendar_features(index: pd.DatetimeIndex) -> pd.DataFrame:
    """Calendar effects that are fully known in advance (no data is read from the future)."""
    from pandas.tseries.holiday import USFederalHolidayCalendar

    idx = index.tz_localize(None) if index.tz is not None else index
    day = idx.normalize()
    f = pd.DataFrame(index=index)
    f["cal_dom"] = day.day
    f["cal_days_to_month_end"] = (day + pd.offsets.MonthEnd(0) - day).days
    f["cal_days_to_quarter_end"] = (day + pd.offsets.QuarterEnd(startingMonth=3) - day).days
    month = day.month
    f["cal_month_sin"] = np.sin(2 * np.pi * month / 12)
    f["cal_month_cos"] = np.cos(2 * np.pi * month / 12)

    years = range(day.year.min() - 1, day.year.max() + 2)
    first_fri = sorted(pd.Timestamp(y, m, 1) + pd.offsets.Week(weekday=4) if pd.Timestamp(y, m, 1).weekday() != 4
                       else pd.Timestamp(y, m, 1) for y in years for m in range(1, 13))
    third_fri = [d + pd.Timedelta(days=14) for d in first_fri]  # US jobs report (usually) and monthly option expiry

    def days_to(target_dates):
        t = pd.DatetimeIndex(target_dates).values
        pos = np.searchsorted(t, day.values, side="left")
        pos = np.clip(pos, 0, len(t) - 1)
        return (t[pos] - day.values).astype("timedelta64[D]").astype(int)

    f["cal_days_to_nfp"] = days_to(first_fri)
    f["cal_days_to_opex"] = days_to(third_fri)
    hol = USFederalHolidayCalendar().holidays(start=f"{years[0]}-01-01", end=f"{years[-1]}-12-31")
    f["cal_days_to_holiday"] = days_to(hol)
    prev = np.searchsorted(hol.values, day.values, side="right") - 1
    prev = np.clip(prev, 0, len(hol) - 1)
    f["cal_days_since_holiday"] = (day.values - hol.values[prev]).astype("timedelta64[D]").astype(int)
    return f


# ------------------------------------------------------------------------------------------------ FRED (free, no key)
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def _fred_fetch(series_id: str, client=None) -> pd.DataFrame:
    import httpx

    get = client.get if client is not None else httpx.get
    r = get(FRED_URL, params={"id": series_id, "cosd": "2006-01-01"}, timeout=40, headers={"User-Agent": "gold-predictor/1.0"})
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    df.columns = ["date", "v"]
    df["v"] = pd.to_numeric(df["v"], errors="coerce")
    return df.dropna()


def load_fred(series: dict, data_dir: str = "data", client=None) -> dict:
    """US macro series from FRED's public CSV endpoint (no key). `series` is {name: {"id": "DFII10", "lag": 2}}.

    FRED publishes a day's value a business day or more later, so each value is moved forward by `lag` days:
    the series is indexed by the day it was actually usable, which keeps tests honest. If a download fails the
    cached copy is used, and a series with neither is simply left out."""
    cache = Path(data_dir) / "fred"
    cache.mkdir(parents=True, exist_ok=True)
    out = {}
    for name, spec in (series or {}).items():
        f = cache / f"{spec['id']}.parquet"
        try:
            df = _fred_fetch(spec["id"], client)
            df.to_parquet(f)
        except Exception as e:
            if not f.exists():
                print(f"warning: FRED {spec['id']} unavailable: {type(e).__name__}", flush=True)
                continue
            df = pd.read_parquet(f)
        s = pd.Series(df["v"].values, index=pd.to_datetime(df["date"]) + pd.Timedelta(days=int(spec.get("lag", 2))), name=name)
        out[name] = s[~s.index.duplicated(keep="last")].sort_index()
    return out
