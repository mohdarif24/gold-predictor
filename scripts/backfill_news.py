"""Build the daily-headline history so news mood can be used (and tested) as a model input.
    python scripts/backfill_news.py [--start 2016-01-01] [--end today] [--query "gold price"]
Resumable and polite (about one request per second). Uses DATABASE_URL, else the local SQLite file."""
import argparse
import sys
from pathlib import Path

import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import news, store  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--start", default="2016-01-01")
ap.add_argument("--end", default=str(pd.Timestamp.today().date()))
ap.add_argument("--query", default="gold price")
ap.add_argument("--pause", type=float, default=1.0)
a = ap.parse_args()

db = store.connect_cfg(yaml.safe_load(Path("config.yaml").read_text()))
print(news.backfill_news(db, a.start, a.end, a.query, pause=a.pause, log=lambda m: print(m, flush=True)))
