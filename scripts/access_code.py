"""Manage who can sign in to the website (used when Cloudflare Access is not set up).

    python scripts/access_code.py add someone@example.com      # creates (or replaces) their code and shows it ONCE
    python scripts/access_code.py add boss@example.com --admin # an administrator sees every screen; others see the signal
    python scripts/access_code.py add someone@example.com --code My-Own-Code-2026   # use a code you chose
    python scripts/access_code.py revoke someone@example.com   # takes access away immediately
    python scripts/access_code.py list

A code is 22 random characters (about 128 bits), so it cannot be guessed. Only its SHA-256 hash is stored.
Uses DATABASE_URL, else the local SQLite file. Add --save FILE to write the new code to a file instead of the screen.
"""
import argparse
import hashlib
import secrets
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import store  # noqa: E402


def code_hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode()).hexdigest()


MIN_CODE = 10  # the website's sign-in refuses anything shorter


def add(db, email: str, admin: bool = False, code: str | None = None) -> str:
    """Generate a code, or use the one given (10-100 characters, no spaces, not already someone else's)."""
    if code is not None:
        code = code.strip()
        if not MIN_CODE <= len(code) <= 100 or any(c.isspace() for c in code):
            raise ValueError(f"the code must be {MIN_CODE} to 100 characters with no spaces")
        other = db.execute("SELECT email FROM access_codes WHERE code_hash=? AND email<>?",
                           (code_hash(code), email.strip().lower())).fetchone()
        if other:
            raise ValueError("this code is already used by someone else")
    code = code or secrets.token_urlsafe(16)
    db.execute("INSERT INTO access_codes(email, code_hash, created, role) VALUES(?,?,?,?) "
               "ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, created=excluded.created, last_used=NULL, role=excluded.role",
               (email.strip().lower(), code_hash(code), store.now_iso(), "admin" if admin else "user"))
    db.commit()
    return code


def revoke(db, email: str) -> bool:
    n = db.execute("DELETE FROM access_codes WHERE email=? RETURNING email", (email.strip().lower(),)).fetchall()
    db.commit()
    return bool(n)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["add", "revoke", "list"])
    ap.add_argument("email", nargs="?")
    ap.add_argument("--save", help="write the new code to this file instead of printing it")
    ap.add_argument("--admin", action="store_true", help="give this person the administrator view")
    ap.add_argument("--code", help="use this code instead of generating one (10+ characters, no spaces)")
    a = ap.parse_args()
    db = store.connect_cfg(yaml.safe_load(Path("config.yaml").read_text()))
    if a.action == "add":
        try:
            code = add(db, a.email, admin=a.admin, code=a.code)
        except ValueError as e:
            raise SystemExit(f"not added: {e}")
        if a.save:
            Path(a.save).parent.mkdir(parents=True, exist_ok=True)
            Path(a.save).write_text(f"Website: sign in with this access code\nEmail: {a.email}\nCode:  {code}\n", encoding="utf-8")
            print(f"code for {a.email} written to {a.save}")
        else:
            print(f"access code for {a.email} (shown once, store it safely): {code}")
    elif a.action == "revoke":
        print("revoked" if revoke(db, a.email) else "no such email")
    else:
        for r in db.execute("SELECT email, role, created, last_used FROM access_codes ORDER BY email").fetchall():
            print(f"{r['email']:35} {r['role']:6} created {r['created']}  last used {r['last_used'] or '-'}")
