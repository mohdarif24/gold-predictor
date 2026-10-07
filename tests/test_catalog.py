import json
from pathlib import Path

import yaml

from core import catalog, settings, store

CFG = yaml.safe_load((Path(__file__).resolve().parents[1] / "config.yaml").read_text())


def test_catalog_lists_every_source_and_parameter_without_secret_values(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-very-secret-value")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:hunter2@host/db")
    db = store.connect(str(tmp_path / "t.db"))
    c = catalog.build(CFG, db)
    ids = {s["id"] for s in c["sources"]}
    assert {"yf:drivers", "fred", "cftc", "news", "calendar", "llm", "alerts"} <= ids
    assert {f"yf:{k}" if v["source"] != "mt5" else f"mt5:{k}" for k, v in CFG["instruments"].items()} <= ids
    fred = next(s for s in c["sources"] if s["id"] == "fred")
    assert {p["name"] for p in fred["params"]} == set(CFG["fred"])
    drivers = next(s for s in c["sources"] if s["id"] == "yf:drivers")
    assert {p["name"]: p["value"] for p in drivers["params"]} == CFG["drivers"]
    env = {e["name"]: e for e in c["job_env"]}
    assert env["LLM_API_KEY"]["set"] and env["LLM_API_KEY"]["secret"] and not env["TELEGRAM_BOT_TOKEN"]["set"]
    text = json.dumps(c)
    assert "sk-very-secret-value" not in text and "hunter2" not in text
    assert any(p["name"] == "signal_threshold" for p in c["model"])
    # it round-trips through the settings table the API reads
    settings.put(db, {"catalog": store.dumps(c)})
    assert json.loads(settings.get_all(db)["catalog"])["sources"][0]["id"] == c["sources"][0]["id"]
    db.close()
