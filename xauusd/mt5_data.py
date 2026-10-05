"""XAU/USD market data from the local MetaTrader 5 terminal (Windows only; terminal must be running)."""
import os

import MetaTrader5 as mt5
import pandas as pd

TF = {
    "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
    "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4, "D1": mt5.TIMEFRAME_D1,
}
_connected = False


def connect():
    """Attach to the running terminal; if MT5_LOGIN/PASSWORD/SERVER are in .env, log in with them (use a DEMO account)."""
    global _connected
    if _connected:
        return
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    login = os.getenv("MT5_LOGIN")
    ok = mt5.initialize(login=int(login), password=os.getenv("MT5_PASSWORD"), server=os.getenv("MT5_SERVER")) \
        if login else mt5.initialize()
    if not ok:
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}. Is the MT5 terminal installed and running?")
    _connected = True


def get_bars(symbol: str, tf: str, n: int) -> pd.DataFrame:
    """Last n COMPLETED bars (start_pos=1 skips the forming bar). Broker server time is kept as-is (naive)."""
    connect()
    if not mt5.symbol_select(symbol, True):
        raise RuntimeError(f"Symbol {symbol} not found in MT5 Market Watch (Exness may use a suffix, e.g. XAUUSDm)")
    rates = mt5.copy_rates_from_pos(symbol, TF[tf], 1, n)
    if rates is None or len(rates) == 0:
        raise RuntimeError(f"No {tf} data for {symbol}: {mt5.last_error()}")
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s")
    df = df.set_index("time").rename(columns={"tick_volume": "volume"})
    return df[["open", "high", "low", "close", "volume", "spread"]]


def current_tick(symbol: str) -> dict:
    connect()
    t = mt5.symbol_info_tick(symbol)
    return {"bid": t.bid, "ask": t.ask, "spread": t.ask - t.bid, "time": pd.to_datetime(t.time, unit="s")}
