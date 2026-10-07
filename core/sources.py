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

    # India, the second-largest buyer of gold: festival buying, wedding season, and budget day (import duty news)
    dhanteras = pd.DatetimeIndex(DIWALI) - pd.Timedelta(days=2)
    f["cal_days_to_dhanteras"] = np.minimum(days_to(dhanteras), 400)
    f["cal_days_to_akshaya"] = np.minimum(days_to(pd.DatetimeIndex(AKSHAYA_TRITIYA)), 400)
    f["cal_india_festival_window"] = ((f["cal_days_to_dhanteras"] <= 10) | (f["cal_days_to_akshaya"] <= 10)).astype(float)
    f["cal_india_wedding_season"] = np.isin(month, WEDDING_MONTHS).astype(float)
    f["cal_days_to_india_budget"] = np.minimum(days_to(india_budget_days(years)), 400)
    return f


# Hindu-calendar festival dates (vary by a day between regions; the windowed features above do not care).
DIWALI = ["2006-10-21", "2007-11-09", "2008-10-28", "2009-10-17", "2010-11-05", "2011-10-26", "2012-11-13", "2013-11-03",
          "2014-10-23", "2015-11-11", "2016-10-30", "2017-10-19", "2018-11-07", "2019-10-27", "2020-11-14", "2021-11-04",
          "2022-10-24", "2023-11-12", "2024-10-31", "2025-10-20", "2026-11-08", "2027-10-29", "2028-10-17", "2029-11-05",
          "2030-10-26"]
AKSHAYA_TRITIYA = ["2006-04-30", "2007-04-20", "2008-05-08", "2009-04-27", "2010-05-16", "2011-05-06", "2012-04-24",
                   "2013-05-13", "2014-05-02", "2015-04-21", "2016-05-09", "2017-04-28", "2018-04-18", "2019-05-07",
                   "2020-04-26", "2021-05-14", "2022-05-03", "2023-04-22", "2024-05-10", "2025-04-30", "2026-04-19",
                   "2027-05-09", "2028-04-27", "2029-04-16", "2030-05-05"]
WEDDING_MONTHS = [11, 12, 1, 2, 4, 5]  # the main Indian wedding seasons (approximate)
EXTRA_BUDGETS = ["2009-07-06", "2014-02-17", "2014-07-10", "2019-07-05", "2024-07-23"]  # interim / post-election budgets


def india_budget_days(years) -> pd.DatetimeIndex:
    """Union Budget day: the last working day of February until 2016, 1 February since 2017, plus post-election ones."""
    days = [pd.Timestamp(y, 2, 1) if y >= 2017 else pd.Timestamp(y, 3, 1) - pd.offsets.BDay(1) for y in years]
    return pd.DatetimeIndex(sorted(set(days) | set(pd.to_datetime(EXTRA_BUDGETS))))


# ------------------------------------------------------------------------------------------------ Geopolitical Risk index
GPR_COLUMNS = {"GPRD_MA7": "gpr", "GPRD_THREAT": "gpr_threat"}  # 7-day average of the daily index, and the "threats" part


def load_gpr(spec: dict | None, data_dir: str = "data", client=None) -> dict:
    """Caldara & Iacoviello's daily Geopolitical Risk index (newspaper-based, free). Moved forward by `lag` days so a
    value is only used once the file could have contained it. Cached; a failed download falls back to the cache."""
    if not spec:
        return {}
    cache = Path(data_dir) / "gpr" / "gpr_daily.parquet"
    cache.parent.mkdir(parents=True, exist_ok=True)
    try:
        import httpx

        get = client.get if client is not None else httpx.get
        r = get(spec["url"], timeout=90, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True)
        r.raise_for_status()
        raw = pd.read_excel(io.BytesIO(r.content))
        df = pd.DataFrame({"date": pd.to_datetime(raw["DAY"].astype(int).astype(str), format="%Y%m%d"),
                           **{k: pd.to_numeric(raw[k], errors="coerce") for k in GPR_COLUMNS}}).dropna()
        df.to_parquet(cache)
    except Exception as e:
        if not cache.exists():
            print(f"warning: GPR index unavailable: {type(e).__name__}", flush=True)
            return {}
        df = pd.read_parquet(cache)
    idx = pd.DatetimeIndex(df["date"]) + pd.Timedelta(days=int(spec.get("lag", 7)))
    return {name: pd.Series(df[col].values, index=idx, name=name).sort_index() for col, name in GPR_COLUMNS.items()}


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
