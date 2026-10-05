"""Prints the hold-out results table (Markdown) straight from the database, so the README never needs hand-copied numbers.
Run from the project root:   python scripts/readme_table.py        (uses DATABASE_URL, else the local SQLite file)
"""
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import store  # noqa: E402

cfg = yaml.safe_load(Path("config.yaml").read_text())
db = store.connect_cfg(cfg)
LABEL = {"xauusd_yf": "Gold futures (GC=F)", "nse_etf": "Gold ETF (GOLDBEES.NS)"}
HZ = {"30m": "30 min", "1h": "1 hour", "1d": "1 day", "1w": "1 week"}

rows, notes = [], []
for inst, c in cfg["instruments"].items():
    if not c.get("enabled", True) or c["source"] == "mt5":
        continue
    first = True
    for hz in c["horizons"]:
        r = store.load_research(db, inst, hz["name"])
        if not r:
            continue
        h, s = r["holdout"], r["selected"]
        ci = h.get("auc_ci") or [None, None]
        rows.append(
            f"| {LABEL.get(inst, inst) if first else ''} | {HZ.get(hz['name'], hz['name'])} | {s['feature_set']} + {s['model']} "
            f"| {r['holdout_rows']:,} | {h['auc']:.3f} ({ci[0]:.3f} to {ci[1]:.3f}) | {h['accuracy'] * 100:.1f}% "
            f"| {h['baseline_accuracy'] * 100:.1f}% | {h['net_return_total'] * 100:+.1f}% | {h['buy_hold_return'] * 100:+.1f}% | {h['long_share'] * 100:.0f}% | {'**passed**' if h['has_edge'] else 'no edge'} |")
        first = False
        for hc in h.get("high_confidence", []):
            if hc["says_at_least"] == 0.8:
                notes.append(f"- {LABEL.get(inst, inst)}, {HZ.get(hz['name'])}: said 80%+ {hc['n']} time(s)"
                             + (f", right {hc['accuracy'] * 100:.0f}% of them" if hc["n"] else ""))

if not rows:
    sys.exit("no research results in this database yet: run  python -m research.study all")
print("| Series | Horizon | Chosen on older data | Hold-out bars | AUC (95% range) | Accuracy | Guess | Net return* | Buy & hold* | Long share | Verdict |")
print("|---|---|---|---:|---|---:|---:|---:|---:|---:|---|")
print("\n".join(rows))
print("\nHow often the model claimed 80%+ confidence on the hold-out:")
print("\n".join(notes))
