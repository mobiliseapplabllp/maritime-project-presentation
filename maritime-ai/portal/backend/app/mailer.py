"""SMTP mailer — sends OTP and notification emails.

Config lives in agent_state/smtp_config.json (chmod 600, not in code) and is
editable from the admin UI. Never logs the password.
"""
import json
import os
import smtplib
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from . import config

_CFG_PATH = os.path.join(os.path.abspath(config.AGENT_STATE_DIR), "smtp_config.json")


def get_config(masked=False):
    try:
        cfg = json.load(open(_CFG_PATH))
    except Exception:
        cfg = {}
    if masked:
        cfg = dict(cfg)
        if cfg.get("password"):
            cfg["password"] = "••••••••"
    return cfg


def set_config(patch):
    cfg = get_config()
    for k in ("host", "port", "user", "from_email", "from_name", "starttls"):
        if k in (patch or {}):
            cfg[k] = patch[k]
    # only overwrite password if a real (non-masked) value is supplied
    if patch and patch.get("password") and "•" not in patch["password"]:
        cfg["password"] = patch["password"]
    json.dump(cfg, open(_CFG_PATH, "w"), indent=1)
    os.chmod(_CFG_PATH, 0o600)
    return get_config(masked=True)


def send(to_email, subject, html, text=None, attachments=None):
    """Send one email. attachments = list of (filename, bytes, mimetype).
    Returns (ok: bool, detail: str)."""
    cfg = get_config()
    if not (cfg.get("host") and cfg.get("user")):
        return False, "SMTP not configured"
    body = MIMEMultipart("alternative")
    if text:
        body.attach(MIMEText(text, "plain"))
    body.attach(MIMEText(html, "html"))
    if attachments:
        msg = MIMEMultipart("mixed")
        msg.attach(body)
        for fname, data, mime in attachments:
            part = MIMEApplication(data, _subtype=((mime or "octet-stream").split("/")[-1]))
            part.add_header("Content-Disposition", "attachment", filename=fname)
            msg.attach(part)
    else:
        msg = body
    msg["Subject"] = subject
    msg["From"] = f"{cfg.get('from_name', 'Sagar Drishti')} <{cfg.get('from_email', cfg['user'])}>"
    msg["To"] = to_email
    try:
        with smtplib.SMTP(cfg["host"], int(cfg.get("port", 587)), timeout=20) as s:
            s.ehlo()
            if cfg.get("starttls", True):
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
            s.login(cfg["user"], cfg.get("password", ""))
            s.sendmail(cfg.get("from_email", cfg["user"]), [to_email], msg.as_string())
        return True, "sent"
    except Exception as e:
        return False, str(e)[:200]


def otp_email(code, minutes=10):
    subject = f"Your Sagar Drishti sign-in code: {code}"
    html = f"""<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:440px;margin:0 auto">
      <div style="background:#0d5c8f;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
        <div style="font-weight:700;font-size:16px">Sagar Drishti</div>
        <div style="opacity:.85;font-size:12px">Maritime AI Analytics</div>
      </div>
      <div style="border:1px solid #e2e8ec;border-top:none;border-radius:0 0 12px 12px;padding:24px 22px">
        <p style="font-size:14px;color:#334">Use this code to sign in:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0a4b6b;text-align:center;
          background:#eef3f6;border-radius:10px;padding:16px 0;margin:12px 0">{code}</div>
        <p style="font-size:12.5px;color:#778">It expires in {minutes} minutes. If you didn't request it, ignore this email.</p>
      </div>
    </div>"""
    text = f"Your Sagar Drishti sign-in code is {code}. It expires in {minutes} minutes."
    return subject, html, text
