import numpy as np
import pandas as pd

REGIMES = ["TRENDING", "RANGING", "HIGH_VOL", "LOW_VOL", "BREAKOUT", "ABNORMAL"]


def compute_regime(df: pd.DataFrame, f: pd.DataFrame) -> pd.Series:
    """Label each bar with a market regime using only information up to that bar."""
    c = df["close"]
    ret = c.pct_change()
    sigma = ret.rolling(200).std()
    vol_rank = f["atr_pct"].rolling(500, min_periods=100).rank(pct=True)
    trend_strength = (c.ewm(span=12).mean() - c.ewm(span=26).mean()).abs() / (f["atr_pct"] * c)
    hi = df["high"].rolling(20).max().shift(1)
    lo = df["low"].rolling(20).min().shift(1)
    breakout = (c > hi) | (c < lo)
    abnormal = (ret.abs() > 5 * sigma) | (f["vol_ratio"] > 4)

    out = pd.Series("RANGING", index=df.index)
    out[trend_strength > 1.0] = "TRENDING"
    out[vol_rank < 0.2] = "LOW_VOL"
    out[vol_rank > 0.8] = "HIGH_VOL"
    out[breakout & (vol_rank > 0.5)] = "BREAKOUT"
    out[abnormal.fillna(False)] = "ABNORMAL"
    return out


def regime_code(regime: pd.Series) -> pd.Series:
    return regime.map({r: i for i, r in enumerate(REGIMES)}).astype(float)
