import io
import json
import urllib.error

import pytest

from core import news, settings, store


@pytest.fixture
def db(tmp_path):
    d = store.connect(str(tmp_path / "t.db"))
    yield d
    d.close()


def test_encrypt_round_trip_and_wrong_secret():
    tok = settings.encrypt("sk-123", "s3cret")
    assert "sk-123" not in tok and settings.decrypt(tok, "s3cret") == "sk-123"
    with pytest.raises(Exception):
        settings.decrypt(tok, "other")


def test_admin_settings_win_over_environment(db, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("SETTINGS_KEY", "s3cret")
    assert settings.llm_config(db)["key"] == "env-key"
    settings.put(db, {"llm_url": "https://example.test/v1/chat/completions", "llm_model": "m1",
                      "llm_key_enc": settings.encrypt("db-key", "s3cret")}, by="admin@x")
    assert settings.llm_config(db) == {"key": "db-key", "url": "https://example.test/v1/chat/completions", "model": "m1"}
    settings.put(db, {"llm_enabled": "0"})
    assert settings.llm_config(db) is None


def test_undecryptable_key_is_logged_and_env_used(db, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "env-key")
    monkeypatch.setenv("SETTINGS_KEY", "wrong")
    settings.put(db, {"llm_key_enc": settings.encrypt("db-key", "s3cret")})
    assert settings.llm_config(db)["key"] == "env-key"
    row = db.execute("SELECT ok, error FROM api_logs").fetchone()
    assert row["ok"] == 0 and "decrypt" in row["error"]


class _Resp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_llm_calls_are_logged(db, monkeypatch):
    cfg = {"key": "k", "url": "https://example.test/chat", "model": "m"}
    answer = json.dumps({"choices": [{"message": {"content": '[{"i":0,"sentiment":0.5,"topic":"rates","impact":"high"}]'}}]})
    monkeypatch.setattr(news.urllib.request, "urlopen", lambda req, timeout: _Resp(answer.encode()))
    assert news.score_llm(["Fed cuts rates"], cfg, db=db)[0]["sentiment"] == 0.5

    def fail(req, timeout):
        raise urllib.error.HTTPError(cfg["url"], 429, "Too Many Requests", {}, io.BytesIO(b'{"error":"quota"}'))
    monkeypatch.setattr(news.urllib.request, "urlopen", fail)
    with pytest.raises(RuntimeError):
        news.score_llm(["Fed cuts rates"], cfg, db=db)

    rows = db.execute("SELECT ok, status, model, request, response, error FROM api_logs ORDER BY id").fetchall()
    assert [(r["ok"], r["status"]) for r in rows] == [(1, 200), (0, 429)]
    assert "Fed cuts rates" in rows[0]["request"] and "quota" in rows[1]["response"] and "429" in rows[1]["error"]


def test_log_keeps_only_newest(db, monkeypatch):
    monkeypatch.setattr(settings, "KEEP_LOGS", 3)
    for i in range(6):
        settings.log(db, "t", f"u{i}")
    assert [r["url"] for r in db.execute("SELECT url FROM api_logs ORDER BY id").fetchall()] == ["u3", "u4", "u5"]
