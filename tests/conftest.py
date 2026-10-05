"""The `db` fixture runs every database test twice: SQLite, and a real Postgres engine (PGlite, same dialect as Neon).
Postgres tests need Node and `pip install py-pglite`; they skip when unavailable.
On Windows py-pglite cannot launch `npm`, so install once and point PGLITE_WORK_DIR at that folder:
    mkdir pglite_work; cd pglite_work; npm init -y; npm i @electric-sql/pglite @electric-sql/pglite-socket
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import store  # noqa: E402

TABLES = ["predictions", "shadow_trades", "heartbeat", "models", "reports", "research", "explanations", "series", "news", "events", "candles", "instruments", "user_settings"]


@pytest.fixture(scope="session")
def pg_dsn():
    try:
        from py_pglite import PGliteConfig, PGliteManager
    except ImportError:
        pytest.skip("py-pglite not installed")
    extra = {}
    if os.getenv("PGLITE_WORK_DIR"):
        extra = {"work_dir": Path(os.environ["PGLITE_WORK_DIR"]), "auto_install_deps": False, "node_modules_check": False}
    try:
        manager = PGliteManager(PGliteConfig(use_tcp=True, tcp_port=54329, timeout=120, **extra))
        manager.start()
    except Exception as e:
        pytest.skip(f"local Postgres unavailable: {e}")
    yield manager.get_dsn()
    manager.stop()


@pytest.fixture(params=["sqlite", "postgres"])
def db(request, tmp_path):
    if request.param == "sqlite":
        d = store.connect(str(tmp_path / "t.db"))
        yield d
        d.close()
    else:
        d = store.connect(request.getfixturevalue("pg_dsn"))
        yield d
        for t in TABLES:
            d.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
        d.commit()
        d.close()
