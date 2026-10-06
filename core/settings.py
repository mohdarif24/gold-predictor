"""Settings the site administrator changes from the web app, and the log of every outside API call.

The LLM provider (URL, model, key) is stored in the app_settings table. The key is encrypted with AES-256-GCM using
SHA-256(SETTINGS_KEY); the same secret is set on the web app, which encrypts it. Format: base64url(nonce || ciphertext).
When nothing is stored, the LLM_API_KEY / LLM_API_URL / LLM_MODEL environment variables are used.
"""
import base64
import hashlib
import os
import time

from . import store

DEFAULT_URL = "https://models.github.ai/inference/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o-mini"
KEEP_LOGS = 2000  # newest rows kept in api_logs
CLIP = 4000  # characters of each request / response kept


def _aes(secret: str):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    return AESGCM(hashlib.sha256(secret.encode()).digest())


def encrypt(plain: str, secret: str) -> str:
    nonce = os.urandom(12)
    return base64.urlsafe_b64encode(nonce + _aes(secret).encrypt(nonce, plain.encode(), None)).decode().rstrip("=")


def decrypt(token: str, secret: str) -> str:
    raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    return _aes(secret).decrypt(raw[:12], raw[12:], None).decode()


def get_all(db) -> dict:
    return {r["name"]: r["value"] for r in db.execute("SELECT name, value FROM app_settings").fetchall()}


def put(db, values: dict, by: str = "script"):
    for k, v in values.items():
        db.execute("INSERT INTO app_settings(name, value, updated, updated_by) VALUES(?,?,?,?) "
                   "ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated = excluded.updated, "
                   "updated_by = excluded.updated_by", (k, v, store.now_iso(), by))
    db.commit()


def llm_config(db=None):
    """The LLM to use, or None. Settings saved by the administrator win over environment variables; the
    administrator can also switch the LLM off entirely."""
    s = get_all(db) if db is not None else {}
    if s.get("llm_enabled") == "0":
        return None
    key = None
    if s.get("llm_key_enc"):
        secret = (os.getenv("SETTINGS_KEY") or "").strip()  # a pasted secret may carry a trailing newline
        if secret:
            try:
                key = decrypt(s["llm_key_enc"], secret)
            except Exception as e:  # wrong SETTINGS_KEY: say so in the API log instead of failing silently
                log(db, "llm", s.get("llm_url") or "", s.get("llm_model") or "", ok=False,
                    error=f"stored key cannot be decrypted (SETTINGS_KEY differs from the web app?): {type(e).__name__}")
        else:
            log(db, "llm", s.get("llm_url") or "", s.get("llm_model") or "", ok=False,
                error="a key is saved in the admin settings but SETTINGS_KEY is not set for the scheduled jobs")
    key = key or os.getenv("LLM_API_KEY")
    if not key:
        return None
    # `or` (not a default argument) because CI passes unset secrets as empty strings
    return {"key": key, "url": s.get("llm_url") or os.getenv("LLM_API_URL") or DEFAULT_URL,
            "model": s.get("llm_model") or os.getenv("LLM_MODEL") or DEFAULT_MODEL}


def log(db, source: str, url: str, model: str = "", ok: bool = True, status: int | None = None, ms: int | None = None,
        request: str = "", response: str = "", error: str = ""):
    """Record one outside API call. Never raises: logging must not break a prediction run."""
    if db is None:
        return
    try:
        db.execute("INSERT INTO api_logs(ts, source, url, model, ok, status, ms, request, response, error) "
                   "VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (store.now_iso(), source, url, model, int(ok), status, ms, request[:CLIP], response[:CLIP], error[:CLIP]))
        db.execute("DELETE FROM api_logs WHERE id <= (SELECT COALESCE(MAX(id), 0) FROM api_logs) - ?", (KEEP_LOGS,))
        db.commit()
    except Exception as e:
        print(f"api log skipped: {type(e).__name__}: {str(e)[:80]}", flush=True)
        try:
            db.rollback()
        except Exception:
            pass


class Timer:
    def __enter__(self):
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *exc):
        self.ms = int((time.perf_counter() - self.t0) * 1000)
