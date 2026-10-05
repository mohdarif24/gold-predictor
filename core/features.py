import numpy as np
import pandas as pd

from .regime import compute_regime, regime_code

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


def build_features(df: pd.DataFrame, tf: str, htf: dict | None = None, drivers: dict | None = None) -> pd.DataFrame:
    """df: OHLCV (+ optional spread). htf: {tf: ohlc df}. drivers: {name: daily close Series}."""
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
    if "spread" in df and df["spread"].sum() > 0:
        s = df["spread"].astype(float)
        f["spread_z"] = (s - s.rolling(100).mean()) / s.rolling(100).std().replace(0, np.nan)

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

    if tf == "D1" and drivers:
        day = df.index.tz_localize(None).normalize() if df.index.tz is not None else df.index.normalize()
        for name, s in drivers.items():
            s = s[~s.index.duplicated()].sort_index()
            for n in (1, 5):
                # lag one day: driver close of day d-1 is the latest value known when day d's bar is predicted
                d = s.pct_change(n).shift(1)
                f[f"{name}_ret{n}"] = d.reindex(day, method="ffill").values

    f["regime_code"] = regime_code(compute_regime(df, f))
    return f.replace([np.inf, -np.inf], np.nan)


def make_target(df: pd.DataFrame, steps: int):
    fwd = df["close"].shift(-steps) / df["close"] - 1
    y = (fwd > 0).astype(float).where(fwd.notna())
    return y, fwd
