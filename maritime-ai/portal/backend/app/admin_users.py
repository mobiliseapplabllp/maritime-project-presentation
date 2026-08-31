"""User & email administration — admin-only CRUD, OTP request/verify, SMTP control."""
import os

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from . import mailer, users_db
from .auth import current_user, make_token, authenticate_otp, require_admin

# public (no-auth) OTP flow lives under /api/auth
auth_router = APIRouter(prefix="/api/auth")
# admin-only management
admin_router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])

_DEV_ECHO = os.environ.get("SAGAR_OTP_DEV_ECHO", "0") == "1"


class OtpReq(BaseModel):
    email: str


class OtpVerify(BaseModel):
    email: str
    code: str


@auth_router.post("/otp/request")
def otp_request(body: OtpReq):
    code, user = users_db.issue_otp(body.email)
    if not code:
        # internal tool for a known user set — be explicit rather than pretend to send
        return {"sent": False, "unknown": True,
                "message": "No account found for that email. Ask your administrator to add you."}
    subject, html, text = mailer.otp_email(code)
    ok, detail = mailer.send(user["email"], subject, html, text)
    resp = {"sent": True, "email_ok": ok,
            "message": "A sign-in code has been emailed." if ok
                       else "Code generated, but email delivery failed — check with your admin."}
    if not ok:
        print(f"[OTP] email to {user['email']} FAILED ({detail}); dev code = {code}")
        if _DEV_ECHO:
            resp["dev_code"] = code
    return resp


@auth_router.post("/otp/verify")
def otp_verify(body: OtpVerify):
    user = authenticate_otp(body.email, body.code)
    if not user:
        raise HTTPException(401, "Invalid or expired code")
    return {"access_token": make_token(user), "token_type": "bearer", "user": user}


# ------------------------------------------------------------------ admin
class UserIn(BaseModel):
    email: str
    name: str = ""
    username: Optional[str] = None
    role: Optional[str] = None
    persona: str = "authority"
    scope: str = "port"
    org: str = "Port Authority"
    is_admin: bool = False
    active: bool = True
    password: Optional[str] = None


@admin_router.get("/users")
def users_list():
    return {"users": users_db.list_users()}


@admin_router.post("/users")
def users_upsert(body: UserIn):
    if "@" not in body.email:
        raise HTTPException(400, "A valid email is required")
    return {"user": users_db.upsert_user(body.dict())}


@admin_router.patch("/users/{email}")
def users_patch(email: str, patch: dict = Body(...)):
    if "active" in patch:
        users_db.set_active(email, patch["active"])
    row = users_db.get_by_login(email)
    if not row:
        raise HTTPException(404, "User not found")
    if any(k in patch for k in ("name", "role", "persona", "scope", "org", "is_admin",
                                "active", "password", "username")):
        merged = {**row, **{k: v for k, v in patch.items() if v is not None}}
        merged["email"] = email
        users_db.upsert_user(merged)
    return {"ok": True, "user": users_db.get_by_login(email)}


@admin_router.delete("/users/{email}")
def users_delete(email: str):
    n = users_db.delete_user(email)
    if not n:
        raise HTTPException(400, "Cannot delete (admin accounts are protected)")
    return {"deleted": True}


@admin_router.post("/users/{email}/send-otp")
def users_send_otp(email: str):
    code, user = users_db.issue_otp(email)
    if not code:
        raise HTTPException(404, "No active user with that email")
    subject, html, text = mailer.otp_email(code)
    ok, detail = mailer.send(user["email"], subject, html, text)
    return {"email_ok": ok, "detail": "sent" if ok else detail}


@admin_router.get("/smtp")
def smtp_get():
    return {"config": mailer.get_config(masked=True)}


@admin_router.put("/smtp")
def smtp_set(patch: dict = Body(...)):
    return {"config": mailer.set_config(patch)}


@admin_router.post("/smtp/test")
def smtp_test(body: dict = Body(...), user=Depends(require_admin)):
    to = body.get("to") or user.get("email")
    if not to:
        raise HTTPException(400, "No recipient")
    ok, detail = mailer.send(to, "Sagar Drishti — SMTP test",
                             "<p>This is a test email from Sagar Drishti (Maritime AI Analytics). SMTP is working.</p>",
                             "SMTP test — working.")
    return {"ok": ok, "detail": detail, "to": to}


# ---- report subscriptions (mailing lists for recurring AI summaries) ----
@admin_router.get("/reports/subscriptions")
def subs_list():
    from . import reports_db
    return {"subscriptions": reports_db.list_subs()}


@admin_router.post("/reports/subscriptions")
def subs_upsert(body: dict = Body(...)):
    from . import reports_db
    if not body.get("kind"):
        raise HTTPException(400, "kind is required")
    reports_db.upsert_sub(body)
    return {"subscriptions": reports_db.list_subs()}


@admin_router.delete("/reports/subscriptions/{sid}")
def subs_delete(sid: int):
    from . import reports_db
    reports_db.delete_sub(sid)
    return {"subscriptions": reports_db.list_subs()}


@admin_router.post("/reports/subscriptions/{sid}/send")
def subs_send_now(sid: int):
    from . import reports_db
    out = reports_db.run_due(force_id=sid)
    return {"result": out[0] if out else {"sent": 0, "errors": ["subscription not found"]}}
