"""Telegram and email alerts for NEW BUY/SELL signals. WAIT never alerts. Secrets come from environment variables.
Recipients are the rows of user_settings (the website writes them; the person is identified by their Cloudflare Access email)."""
import os
import smtplib
from email.message import EmailMessage

import httpx

HORIZON_TEXT = {"30m": "next 30 minutes", "1h": "next hour", "1d": "next day", "1w": "next week"}


def message_for(label: str, rec: dict) -> str:
    action = "BUY (price expected to rise)" if rec["signal"] == "BUY" else "SELL (price expected to fall)"
    chance = rec["p_up"] if rec["signal"] == "BUY" else 1 - rec["p_up"]
    return (f"{label}, {HORIZON_TEXT.get(rec['horizon'], rec['horizon'])}: {action}.\n"
            f"Estimated chance: {chance:.0%}. Price at signal: {rec['price']:.2f}.\n"
            "This is a statistical estimate, not financial advice.")


def telegram_send(chat_id: str, text: str) -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return False
    r = httpx.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=15)
    return r.status_code == 200


def email_send(to: str, subject: str, body: str) -> bool:
    host = os.getenv("SMTP_HOST")
    if not host:
        return False
    msg = EmailMessage()
    msg["From"] = os.getenv("SMTP_FROM", os.getenv("SMTP_USER", ""))
    msg["To"], msg["Subject"] = to, subject
    msg.set_content(body)
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=20) as s:
        s.starttls()
        if os.getenv("SMTP_USER"):
            s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS", ""))
        s.send_message(msg)
    return True


def notify_new(db, cfg: dict, results: list) -> int:
    """Send alerts for newly logged BUY/SELL signals to every user who turned alerts on. Returns messages sent."""
    fresh = [r for r in results if r.get("is_new") and r.get("signal") in ("BUY", "SELL")]
    if not fresh:
        return 0
    users = db.execute("SELECT * FROM user_settings WHERE telegram_on=1 OR email_on=1").fetchall()
    sent = 0
    for rec in fresh:
        label = cfg["instruments"][rec["instrument"]].get("label", rec["instrument"])
        text = message_for(label, rec)
        for u in users:
            try:
                if u["telegram_on"] and u["telegram_chat_id"] and telegram_send(u["telegram_chat_id"], text):
                    sent += 1
                if u["email_on"] and email_send(u["email"], f"Gold signal: {rec['signal']}", text):
                    sent += 1
            except Exception as e:  # one broken channel must not stop the others
                print(f"alert to {u['email']} failed: {e}")
    return sent
