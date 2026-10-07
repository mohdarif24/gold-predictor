"""CLI:  python run.py <instrument|all> <init-db|train|predict|update|tick|loop>

tick = one full cycle (settle trades, predict, publish candles for the website, heartbeat). This is what the
GitHub Actions schedule runs. `all` means every enabled instrument that does not need a local MT5 terminal.
Set DATABASE_URL to use Postgres (Neon); otherwise the SQLite file from config.yaml is used.
"""
import argparse
import os
import time
from functools import lru_cache
from pathlib import Path

import yaml

from core import alerts, catalog, mentor, news, pipeline, settings, store

try:  # local convenience only; CI passes real environment variables
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

CHART_TFS = ("D1", "H1")
_last_news = 0.0  # news and events are shared by every instrument: refresh at most every 10 minutes per process


def load_config(path: str = "config.yaml") -> dict:
    return yaml.safe_load(Path(path).read_text())


def providers(name: str, cfg: dict):
    inst = cfg["instruments"][name]
    from nse_etf import yf_data
    from core import sources
    drivers = lru_cache(maxsize=1)(lambda: {**yf_data.get_drivers(cfg["drivers"]), **sources.load_fred(cfg.get("fred"), cfg["data_dir"]),
                                            **sources.load_gpr(cfg.get("gpr"), cfg["data_dir"])})
    if inst["source"] == "mt5":
        from xauusd import mt5_data
        return (lambda tf: mt5_data.get_bars(inst["symbol"], tf, inst["bars"][tf])), drivers
    hist = inst.get("history")
    if not hist:
        return (lambda tf: yf_data.get_bars(inst["symbol"], tf, cfg["data_dir"])), drivers

    # intraday bars: Yahoo's recent ~60 days, with years of Dukascopy history spliced in front (core/dukascopy.py)
    from datetime import date, timedelta
    from core import dukascopy

    # DUKASCOPY_MAX_DAYS caps downloads per run (the 15-minute job sets it; training and research fetch everything)
    cap = os.getenv("DUKASCOPY_MAX_DAYS")
    minutes = lru_cache(maxsize=1)(lambda: dukascopy.load_minutes(
        hist["symbol"], date.today() - timedelta(days=int(365 * hist.get("years", 3))), date.today(), cfg["data_dir"],
        max_fetch=int(cap) if cap else None))

    def bars(tf):
        recent = yf_data.get_bars(inst["symbol"], tf, cfg["data_dir"])
        if tf not in dukascopy.RULE:
            return recent
        return dukascopy.splice(recent, dukascopy.resample(minutes(), tf))
    return bars, drivers


def show(results: list):
    for r in results:
        p = f"P(up)={r['p_up']:.1%}" if "p_up" in r else ""
        print(f"{r['instrument']:10} {r['horizon']:>4}  {r['signal']:<5} {p:<12} {r.get('regime', ''):<9} {r['reason']}",
              flush=True)


def targets(cfg: dict, which: str) -> list:
    if which != "all":
        return [which]
    return [k for k, v in cfg["instruments"].items() if v.get("enabled", True) and v["source"] != "mt5"]


def refresh_news_once(db):
    global _last_news
    if time.time() - _last_news < 600:
        return
    _last_news = time.time()
    try:
        print(f"news: {news.refresh_news(db)} new headlines, {news.refresh_events(db)} calendar events", flush=True)
    except Exception as e:  # news is extra context; never block predictions
        db.rollback()
        print(f"news skipped: {e}", flush=True)


def run_command(command: str, name: str, cfg: dict, db):
    raw_bars, get_drivers = providers(name, cfg)
    get_bars = lru_cache(maxsize=None)(raw_bars)  # one download per timeframe per pass
    get_news = lambda: news.news_features(db)  # noqa: E731  daily news mood collected so far (empty at first)

    if command == "train":
        for hz, m in pipeline.train(name, cfg, get_bars, get_drivers, db, get_news=get_news).items():
            print(f"[{name} {hz}] rows={m['rows']} auc={m.get('auc')} acc={m.get('accuracy')} "
                  f"base={m.get('baseline_accuracy')} net={m.get('net_return_total')} "
                  f"edge={m['has_edge']} :: {m['reason']}", flush=True)
    elif command == "update":
        pipeline.update(name, cfg, get_bars, db)
    elif command in ("predict", "tick"):
        if command == "tick":
            pipeline.update(name, cfg, get_bars, db)
            refresh_news_once(db)
        results = pipeline.predict(name, cfg, get_bars, get_drivers, db, get_news=get_news)
        show(results)
        if command == "tick" and any(r.get("is_new") for r in results):
            try:  # the AI mentor comments on every new reading (only when an AI model is set up)
                m = mentor.comment(db, name, cfg, results)
                if m:
                    print(f"mentor: {m['body']['en']['headline']}" + ("" if m["grounded"] else f" (unverified numbers: {m['issues']})"), flush=True)
            except Exception as e:  # commentary is extra; never block predictions
                db.rollback()
                print(f"mentor skipped: {type(e).__name__}: {str(e)[:120]}", flush=True)
        try:
            alerts.notify_new(db, cfg, results)
        except Exception as e:  # alerts are optional and must never break prediction
            print(f"alerts skipped: {e}", flush=True)
        if command == "tick":
            for tf in CHART_TFS:
                try:
                    store.save_candles(db, name, tf, get_bars(tf))
                except Exception as e:  # the chart is a nicety; predictions already saved
                    db.rollback()
                    print(f"candles {name} {tf} skipped: {e}", flush=True)
            try:  # the inputs themselves, for the 'what gold depends on' screen
                for dn, s in get_drivers().items():
                    store.save_series(db, f"driver:{dn}", s)
                cot = pipeline.load_cot(cfg)
                if cot is not None:
                    for col in ("cot_mm_net", "cot_pm_net", "cot_mm_rank3y"):
                        store.save_series(db, col, cot[col])
            except Exception as e:
                db.rollback()
                print(f"input series skipped: {e}", flush=True)
            store.beat(db, name)


def main():
    cfg = load_config()
    ap = argparse.ArgumentParser()
    ap.add_argument("instrument", choices=["all", *cfg["instruments"]])
    ap.add_argument("command", choices=["init-db", "train", "predict", "update", "tick", "loop"])
    ap.add_argument("--every", type=int, default=120, help="loop interval in seconds")
    a = ap.parse_args()

    db = store.connect_cfg(cfg)
    store.sync_instruments(db, cfg)
    try:  # the super admin's "Data & APIs" page reads this inventory (no secret values, only whether each is set)
        settings.put(db, {"catalog": store.dumps(catalog.build(cfg, db))})
    except Exception as e:
        db.rollback()
        print(f"catalog skipped: {e}", flush=True)
    if a.command == "init-db":
        print("database ready", flush=True)
        return

    names = targets(cfg, a.instrument)
    failed = []
    while True:
        for name in names:
            try:
                run_command("tick" if a.command == "loop" else a.command, name, cfg, db)
            except Exception as e:
                db.rollback()
                failed.append(name)
                print(f"{name} failed: {type(e).__name__}: {e}", flush=True)
        if a.command != "loop":
            break
        time.sleep(a.every)
    if failed:  # make scheduled runs show red in GitHub so a broken instrument is noticed
        raise SystemExit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
