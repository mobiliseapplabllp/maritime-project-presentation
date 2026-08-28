"""
Authentication — JWT bearer tokens over seeded, role-scoped accounts.

Two personas (port authority / terminal operator) and a scope claim
(port | zone:<Zone> | terminal:<ID> | berth:<code>) that the analytics layer
enforces (see data.Store.visible). Swap SEED_USERS for a real user table to
productionise.
"""
import datetime as dt
import hashlib
import hmac

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from . import config

oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def _hash(pw: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), b"sagar-drishti-salt", 120_000).hex()


# Seeded accounts. Demo password for all: Demo@2026
_PW = _hash("Demo@2026")


def _u(name, role, scope, persona, org):
    return {"name": name, "role": role, "scope": scope, "persona": persona, "org": org, "pw": _PW}


SEED_USERS = {
    # ---- Port administration — assurance lens across the whole port ----
    "harbour.master": _u("Capt. Rajiv Nair", "Harbour Master — Port Administrator",
                         "port", "authority", "Mundra Port"),
    "hse.chief": _u("Dr. Kavita Raval", "Chief — HSE & Environment",
                    "port", "authority", "Mundra Port"),
    "finance": _u("Meenakshi Iyer", "Controller — Revenue & Billing",
                  "port", "authority", "Mundra Port"),
    "analyst": _u("Ishaan Trivedi", "Data Analyst — Port MIS",
                  "port", "authority", "Mundra Port"),
    # ---- Business / terminal operators — scoped operational lens ----
    "head.container": _u("Devika Anand", "Head — Container Business",
                         "zone:Container", "operator", "Container Zone"),
    "tm.mict": _u("Nirav Adhia", "Terminal Manager — MICT",
                  "terminal:MICT", "operator", "MICT"),
}


def _as_user(row):
    return {"username": row.get("username") or row["email"], "name": row["name"],
            "role": row["role"], "scope": row["scope"], "persona": row["persona"],
            "org": row["org"], "is_admin": bool(row.get("is_admin")), "email": row["email"]}


def authenticate(username: str, password: str):
    """DB-backed password login, with the hardcoded seed dict as a final fallback."""
    try:
        from . import users_db
        row = users_db.verify_password(username.strip(), password)
        if row:
            return _as_user(row)
    except Exception:
        pass
    key = username.strip().lower()
    u = SEED_USERS.get(key)
    if not u or not hmac.compare_digest(u["pw"], _hash(password)):
        return None
    return {"username": key, "name": u["name"], "role": u["role"],
            "scope": u["scope"], "persona": u["persona"], "org": u["org"],
            "is_admin": key == "harbour.master"}


def make_token(user: dict) -> str:
    payload = {
        "sub": user["username"], "name": user["name"], "role": user["role"],
        "scope": user["scope"], "persona": user["persona"], "org": user["org"],
        "is_admin": bool(user.get("is_admin")), "email": user.get("email"),
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=config.TOKEN_TTL_HOURS),
        "iat": dt.datetime.now(dt.timezone.utc),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGO)


def authenticate_otp(email: str, code: str):
    from . import users_db
    row = users_db.verify_otp(email.strip(), code)
    return _as_user(row) if row else None


def current_user(token: str = Depends(oauth2)):
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[config.JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — please sign in again")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return {"username": payload["sub"], "name": payload.get("name"), "role": payload.get("role"),
            "scope": payload.get("scope"), "persona": payload.get("persona", "authority"),
            "org": payload.get("org", "Mundra Port"), "is_admin": bool(payload.get("is_admin")),
            "email": payload.get("email")}


def require_admin(user=Depends(current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
