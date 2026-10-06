import re
import warnings

import numpy as np
import pandas as pd

# the feature table is assembled column by column on purpose (clear, and fast enough)
warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)

from .regime import compute_regime, regime_code
from .sources import calendar_features

_MACRO = re.compile(r"(_ret1|_ret5|_ret20|_lvlz)$|^x_")
TECH_EXTRA = ("bb_", "stoch_", "adx", "di_", "cci", "pat_", "skew", "kurt", "gap", "dist_", "obv_")
# rates and spreads: a change is measured in percentage points (a % change of a near-zero real yield would explode)
LEVEL_DRIVERS = {"us3m", "us5y", "us10y", "us30y", "real_yield", "breakeven", "fwd_infl_5y5y", "fed_funds", "curve_2s10s"}
GROUPS = ("technical", "technical_extra", "macro", "positioning", "calendar", "news")


def feature_group(col: str) -> str:
    """Which family of inputs a column belongs to (feature sets, and the 'what drives gold' screen)."""
    if col.startswith("cot_"):
        return "positioning"
    if col.startswith("cal_"):
        return "calendar"
    if col.startswith("news_"):
        return "news"
    if _MACRO.search(col):
        return "macro"
    if col.startswith(TECH_EXTRA):
        return "technical_extra"
    return "technical"


FEATURE_SETS = {
    "core": {"technical"},
    "tech+": {"technical", "technical_extra"},
    "macro": {"technical", "technical_extra", "macro"},
    "flow": {"technical", "technical_extra", "macro", "positioning", "calendar"},
    "all": set(GROUPS),
}


def select_columns(columns, feature_set: str) -> list:
    keep = FEATURE_SETS[feature_set]
    return [c for c in columns if feature_group(c) in keep]


TF_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}


def _rsi(c: pd.Series, n: int = 14) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    pc = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()


def htf_features(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    """Trend features of a higher timeframe, stamped with the time the bar CLOSES (no look-ahead)."""
    c = df["close"]
    f = pd.DataFrame(index=df.index + pd.Timedelta(minutes=TF_MINUTES[tf]))
    f[f"{tf}_trend"] = ((c.ewm(span=12).mean() - c.ewm(span=26).mean()) / c).values
    f[f"{tf}_rsi"] = _rsi(c).values
    f[f"{tf}_ma_gap"] = (c / c.rolling(50).mean() - 1).values
    f[f"{tf}_atr_pct"] = (atr(df) / c).values
    return f.dropna()


def build_features(df: pd.DataFrame, tf: str, htf: dict | None = None, drivers: dict | None = None,
                   cot: pd.DataFrame | None = None, news: pd.DataFrame | None = None) -> pd.DataFrame:
    """df: OHLCV (+ optional spread). htf: {tf: ohlc df}. drivers: {name: daily close Series}.
    cot / news: daily features indexed by the day each value became public."""
    o, h, l, c = df["open"], df["high"], df["low"], df["close"]
    r1 = c.pct_change()
    f = pd.DataFrame(index=df.index)
    for n in (1, 3, 6, 12, 24):
        f[f"ret_{n}"] = c.pct_change(n)
    f["vol_12"] = r1.rolling(12).std()
    f["vol_48"] = r1.rolling(48).std()
    f["vol_ratio"] = f["vol_12"] / f["vol_48"]
    f["atr_pct"] = atr(df) / c
    f["rsi"] = _rsi(c)
    macd = (c.ewm(span=12).mean() - c.ewm(span=26).mean()) / c
    f["macd"] = macd
    f["macd_hist"] = macd - macd.ewm(span=9).mean()
    for n in (20, 50):
        f[f"ma_gap_{n}"] = c / c.rolling(n).mean() - 1
    hi20, lo20 = h.rolling(20).max(), l.rolling(20).min()
    f["range_pos"] = (c - lo20) / (hi20 - lo20).replace(0, np.nan)
    f["hl_range"] = (h - l) / c
    f["body"] = (c - o) / c

    if "volume" in df and df["volume"].sum() > 0:
        v = df["volume"].astype(float)
        f["volume_z"] = (v - v.rolling(50).mean()) / v.rolling(50).std().replace(0, np.nan)
        obv = (np.sign(r1.fillna(0)) * v).cumsum()
        f["obv_slope20"] = (obv - obv.shift(20)) / v.rolling(20).sum().replace(0, np.nan)
    if "spread" in df and df["spread"].sum() > 0:
        s = df["spread"].astype(float)
        f["spread_z"] = (s - s.rolling(100).mean()) / s.rolling(100).std().replace(0, np.nan)

    # ---- extra technical indicators (all use only past bars) ----
    ma20, sd20 = c.rolling(20).mean(), c.rolling(20).std()
    f["bb_pctb"] = (c - (ma20 - 2 * sd20)) / (4 * sd20).replace(0, np.nan)
    f["bb_width"] = 4 * sd20 / ma20
    hh14, ll14 = h.rolling(14).max(), l.rolling(14).min()
    f["stoch_k"] = 100 * (c - ll14) / (hh14 - ll14).replace(0, np.nan)
    f["stoch_d"] = f["stoch_k"].rolling(3).mean()
    up, dn = h.diff(), -l.diff()
    plus_dm = pd.Series(np.where((up > dn) & (up > 0), up, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((dn > up) & (dn > 0), dn, 0.0), index=df.index)
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    atr14 = tr.ewm(alpha=1 / 14, adjust=False).mean().replace(0, np.nan)
    di_plus = 100 * plus_dm.ewm(alpha=1 / 14, adjust=False).mean() / atr14
    di_minus = 100 * minus_dm.ewm(alpha=1 / 14, adjust=False).mean() / atr14
    f["di_diff"] = di_plus - di_minus
    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan)
    f["adx"] = dx.ewm(alpha=1 / 14, adjust=False).mean()
    tp = (h + l + c) / 3
    mad = tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    f["cci20"] = (tp - tp.rolling(20).mean()) / (0.015 * mad.replace(0, np.nan))
    f["skew20"] = r1.rolling(20).skew()
    f["kurt20"] = r1.rolling(20).kurt()
    f["gap"] = o / c.shift(1) - 1
    long_w = 252 if tf == "D1" else 500
    f["dist_hi"] = c / h.rolling(long_w, min_periods=50).max() - 1
    f["dist_lo"] = c / l.rolling(long_w, min_periods=50).min() - 1
    rng, body, lower, upper = h - l, (c - o).abs(), np.minimum(o, c) - l, h - np.maximum(o, c)
    ok = rng > 0
    f["pat_doji"] = ((body <= 0.1 * rng) & ok).astype(float)
    f["pat_hammer"] = ((lower >= 2 * body) & (upper <= body) & ok).astype(float)
    f["pat_shooting"] = ((upper >= 2 * body) & (lower <= body) & ok).astype(float)
    f["pat_bull_engulf"] = ((c > o) & (c.shift(1) < o.shift(1)) & (c >= o.shift(1)) & (o <= c.shift(1))).astype(float)
    f["pat_bear_engulf"] = ((c < o) & (c.shift(1) > o.shift(1)) & (c <= o.shift(1)) & (o >= c.shift(1))).astype(float)

    if tf != "D1":
        hour = df.index.hour + df.index.minute / 60
        f["hour_sin"] = np.sin(2 * np.pi * hour / 24)
        f["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    f["dow"] = df.index.dayofweek

    for htf_name, hdf in (htf or {}).items():
        hf = htf_features(hdf, htf_name)
        right = hf.reset_index()
        right.columns = ["t"] + list(hf.columns)
        merged = pd.merge_asof(pd.DataFrame({"t": df.index}), right, on="t")
        for col in hf.columns:
            f[col] = merged[col].values

    day = df.index.tz_localize(None).normalize() if df.index.tz is not None else df.index.normalize()
    if drivers:
        D = pd.concat({k: v[~v.index.duplicated()].sort_index() for k, v in drivers.items()}, axis=1).ffill()

        def lagged(series: pd.Series) -> np.ndarray:
            # one day of lag: the previous day's close is the latest value known while today's bar is open
            return series.shift(1).reindex(day, method="ffill").values

        def lvlz(series: pd.Series) -> pd.Series:
            return (series - series.rolling(252, min_periods=60).mean()) / series.rolling(252, min_periods=60).std()

        for name in D.columns:
            for n in (1, 5, 20):
                f[f"{name}_ret{n}"] = lagged(D[name].diff(n) if name in LEVEL_DRIVERS else D[name].pct_change(n))
            f[f"{name}_lvlz"] = lagged(lvlz(D[name]))
        have = set(D.columns)
        if {"global_gold", "silver"} <= have:
            f["x_gold_silver_lvlz"] = lagged(lvlz(D["global_gold"] / D["silver"]))
        if {"copper", "global_gold"} <= have:
            f["x_copper_gold_lvlz"] = lagged(lvlz(D["copper"] / D["global_gold"]))
        if {"us10y", "us3m"} <= have:
            f["x_curve_10y3m"] = lagged(D["us10y"] - D["us3m"])
        if {"us30y", "us5y"} <= have:
            f["x_curve_30y5y"] = lagged(D["us30y"] - D["us5y"])
        if {"tips", "tlt"} <= have:
            f["x_tips_vs_nominal20"] = lagged(D["tips"].pct_change(20) - D["tlt"].pct_change(20))

    for extra in (cot, news):
        if extra is not None and len(extra):
            known = extra[~extra.index.duplicated()].sort_index().reindex(day - pd.Timedelta(days=1), method="ffill")
            for col in extra.columns:
                f[col] = known[col].values

    cal = calendar_features(df.index)
    for col in cal.columns:
        f[col] = cal[col].values

    f["regime_code"] = regime_code(compute_regime(df, f))
    return f.replace([np.inf, -np.inf], np.nan)


def make_target(df: pd.DataFrame, steps: int):
    fwd = df["close"].shift(-steps) / df["close"] - 1
    y = (fwd > 0).astype(float).where(fwd.notna())
    return y, fwd
