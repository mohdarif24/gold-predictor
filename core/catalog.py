"""A read-only inventory of every outside data source, its parameters, and the settings the jobs run with.

Built from config.yaml and the code's own constants on every run and stored in app_settings["catalog"], so the super
admin's "Data & APIs" page always matches what actually runs. Secrets are never included: only whether each environment
variable is set.
"""
import os
from datetime import datetime, timezone

from . import news, settings, sources
from .features import FEATURE_SETS

YF_CHART = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
FRED_CSV = sources.FRED_URL + "?id={id}&cosd=2006-01-01"
GOOGLE_RSS = "https://news.google.com/rss/search?q={query}+when:2d&hl=en-US&gl=US&ceid=US:en"
TELEGRAM = "https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"

# every environment variable the Python jobs read: name -> (purpose, secret?)
JOB_ENV = {
    "DATABASE_URL": ("Neon Postgres connection (empty = local SQLite file)", True),
    "LLM_API_KEY": ("AI model key for news (the Model API page wins when a key is saved there)", True),
    "LLM_API_URL": ("AI model chat-completions address", False),
    "LLM_MODEL": ("AI model name", False),
    "SETTINGS_KEY": ("decrypts the AI key saved on the Model API page (same value as the backend's)", True),
    "TELEGRAM_BOT_TOKEN": ("Telegram alerts", True),
    "SMTP_HOST": ("email alerts: server", False),
    "SMTP_PORT": ("email alerts: port", False),
    "SMTP_USER": ("email alerts: user", False),
    "SMTP_PASS": ("email alerts: password", True),
    "SMTP_FROM": ("email alerts: sender", False),
    "MT5_LOGIN": ("Exness MT5 account (local Windows only)", True),
    "MT5_PASSWORD": ("Exness MT5 password (local Windows only)", True),
    "MT5_SERVER": ("Exness MT5 server (local Windows only)", False),
}


def _p(name, value, where):
    return {"name": name, "value": value if isinstance(value, str) else str(value), "where": where}


def build(cfg: dict, db=None) -> dict:
    insts = cfg["instruments"]
    src = []

    for key, inst in insts.items():
        params = [_p("symbol", inst["symbol"], f"config.yaml > instruments.{key}.symbol"),
                  _p("enabled", inst.get("enabled", True), f"config.yaml > instruments.{key}.enabled"),
                  _p("cost_bps", inst["cost_bps"], f"config.yaml > instruments.{key}.cost_bps"),
                  _p("higher timeframes", ", ".join(inst.get("htf", [])) or "-", f"config.yaml > instruments.{key}.htf")]
        params += [_p(f"horizon {h['name']}", f"{h['tf']} bars × {h['steps']}", f"config.yaml > instruments.{key}.horizons")
                   for h in inst["horizons"]]
        if inst["source"] == "mt5":
            src.append({"id": f"mt5:{key}", "group": "prices", "name": f"Exness MetaTrader 5: {inst['label']}",
                        "url": "MetaTrader5 terminal (local, Windows)", "method": "mt5.copy_rates_from_pos()",
                        "code": "xauusd/mt5_data.py get_bars()", "auth": "env: MT5_LOGIN, MT5_PASSWORD, MT5_SERVER",
                        "refresh": "every tick run, on the Windows PC only", "params": params
                        + [_p("bars per timeframe", inst.get("bars"), f"config.yaml > instruments.{key}.bars")]})
        else:
            src.append({"id": f"yf:{key}", "group": "prices", "name": f"Yahoo Finance prices: {inst['label']}",
                        "url": YF_CHART.format(symbol=inst["symbol"]), "method": "yfinance Ticker.history()",
                        "code": "nse_etf/yf_data.py get_bars()", "auth": "none (free, unofficial)",
                        "refresh": "every 15 minutes (predict.yml)",
                        "params": params + [_p("intervals", "M5=5m/60d, M15=15m/60d, H1=60m/730d, D1=1d/max",
                                                "nse_etf/yf_data.py INTERVAL")]})

    src.append({"id": "yf:drivers", "group": "markets", "name": "Yahoo Finance: market drivers (daily closes)",
                "url": YF_CHART.format(symbol="{ticker}"), "method": "yfinance Ticker.history(period='max', interval='1d')",
                "code": "nse_etf/yf_data.py get_drivers()", "auth": "none (free, unofficial)",
                "refresh": "every 15 minutes; used with a 1-day lag",
                "params": [_p(k, v, f"config.yaml > drivers.{k}") for k, v in cfg.get("drivers", {}).items()]})

    src.append({"id": "fred", "group": "macro", "name": "FRED (Federal Reserve Bank of St. Louis)",
                "url": FRED_CSV.format(id="{series_id}"), "method": "HTTP GET (CSV)", "code": "core/sources.py load_fred()",
                "auth": "none (public CSV)", "refresh": "every 15 minutes, cached; each value used only after its publication lag",
                "params": [_p(k, f"{v['id']} (lag {v.get('lag', 1)} days)", f"config.yaml > fred.{k}")
                           for k, v in (cfg.get("fred") or {}).items()]})

    src.append({"id": "cftc", "group": "positioning", "name": "CFTC Commitments of Traders (disaggregated futures)",
                "url": sources.COT_URL.format(year="{year}"), "method": "HTTP GET (zip of CSV)",
                "code": "core/sources.py load_cot_raw(), cot_features()", "auth": "none (public)",
                "refresh": "weekly report; used from report date + 4 days",
                "params": [_p("history file", sources.COT_HIST_URL, "core/sources.py COT_HIST_URL"),
                           _p("gold contract code", sources.GOLD_CONTRACT, "core/sources.py GOLD_CONTRACT")]
                + [_p(v, k, "core/sources.py COT_COLS") for k, v in sources.COT_COLS.items()]})

    src.append({"id": "news", "group": "news", "name": "Google News RSS (headlines)",
                "url": GOOGLE_RSS.format(query="{query}"), "method": "HTTP GET (RSS XML)",
                "code": "core/news.py fetch_google_news(), refresh_news()", "auth": "none",
                "refresh": "at most every 10 minutes per run",
                "params": [_p(k, v, "core/news.py QUERIES") for k, v in news.QUERIES.items()]})

    src.append({"id": "calendar", "group": "news", "name": "Economic calendar (this week)", "url": news.CAL_URL,
                "method": "HTTP GET (JSON)", "code": "core/news.py refresh_events()", "auth": "none",
                "refresh": "with the news", "params": []})

    llm_saved = settings.get_all(db) if db is not None else {}
    src.append({"id": "llm", "group": "ai", "name": "AI model for news scoring (OpenAI-compatible chat API)",
                "url": llm_saved.get("llm_url") or os.getenv("LLM_API_URL") or settings.DEFAULT_URL,
                "method": "HTTP POST chat/completions (temperature 0)", "code": "core/news.py score_llm()",
                "auth": "Model API page (encrypted) or env LLM_API_KEY",
                "refresh": "only for new headlines; every call is in API Logs",
                "params": [_p("model", llm_saved.get("llm_model") or os.getenv("LLM_MODEL") or settings.DEFAULT_MODEL,
                              "Model API page, else env LLM_MODEL"),
                           _p("enabled", llm_saved.get("llm_enabled", "1") != "0", "Model API page"),
                           _p("batch size", 25, "core/news.py score_articles()")]})

    src.append({"id": "alerts", "group": "alerts", "name": "Alerts: Telegram Bot API and SMTP email",
                "url": TELEGRAM, "method": "HTTP POST / SMTP", "code": "core/alerts.py", "auth": "env: TELEGRAM_BOT_TOKEN, SMTP_*",
                "refresh": "only on a new Buy/Sell signal", "params": []})

    model = [_p("signal_threshold", cfg["signal_threshold"], "config.yaml > signal_threshold"),
             _p("practice stop (× ATR)", cfg["shadow"]["sl_atr"], "config.yaml > shadow.sl_atr"),
             _p("practice target (× ATR)", cfg["shadow"]["tp_atr"], "config.yaml > shadow.tp_atr")]
    model += [_p(f"input set: {k}", ", ".join(sorted(v)), "core/features.py FEATURE_SETS")
              for k, v in FEATURE_SETS.items()]
    try:
        from research.study import GATE, HOLDOUT_FRAC
        model.append(_p("locked hold-out share", HOLDOUT_FRAC, "research/study.py HOLDOUT_FRAC"))
        model += [_p(f"gate: {k}", v, "research/study.py GATE") for k, v in GATE.items()]
    except Exception:  # research needs extra libraries; the inventory must not depend on them
        pass

    env = [{"name": n, "purpose": p, "secret": s, "set": bool(os.getenv(n))} for n, (p, s) in JOB_ENV.items()]
    return {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sources": src, "model": model, "job_env": env}
