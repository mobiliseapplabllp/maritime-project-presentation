"""User store + OTP — Postgres-backed accounts and one-time sign-in codes.

Replaces the hardcoded seed dict with a manageable `app_users` table (admins can
add / edit / deactivate from the UI). Password login still works for legacy demo
accounts; email OTP is the primary path.
"""
import datetime as dt
import hashlib
import hmac
import os
import random

import psycopg2
import psycopg2.extras

DB = os.environ.get("SAGAR_PG_DB", "sagar_drishti")
_SALT = b"sagar-drishti-salt"

DDL = """
create table if not exists app_users (
  email       text primary key,
  username    text unique,
  name        text,
  role        text,
  persona     text default 'authority',
  scope       text default 'port',
  org         text default 'Port Authority',
  is_admin    boolean default false,
  active      boolean default true,
  pw_hash     text,
  created_at  timestamptz default now(),
  last_login  timestamptz
);
create table if not exists otp_codes (
  email       text,
  code        text,
  expires_at  timestamptz,
  used        boolean default false,
  attempts    int default 0,
  created_at  timestamptz default now()
);
create index if not exists ix_otp_email on otp_codes (email);
"""


def _conn():
    return psycopg2.connect(dbname=DB, connect_timeout=4)


def hash_pw(pw):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), _SALT, 120_000).hex()


def init(seed_admin_email="sharma.ashish2450@gmail.com"):
    conn = _conn()
    cur = conn.cursor()
    cur.execute(DDL)
    # seed the demo roles (password login) + one admin (OTP-capable) if table empty
    cur.execute("select count(*) from app_users")
    if cur.fetchone()[0] == 0:
        pw = hash_pw("the port@2026")
        rows = [
            (seed_admin_email, "admin", "Administrator", "Administrator", "authority", "port",
             "Port Authority", True, True, pw),
            ("harbour.master@demo.local", "harbour.master", "Capt. Rajiv Nair",
             "Harbour Master — Port Administrator", "authority", "port", "Port Authority",
             False, True, pw),
            ("head.container@demo.local", "head.container", "Devika Anand",
             "Head — Container Business", "operator", "zone:Container", "Container Zone",
             False, True, pw),
            ("tm.ct3@demo.local", "tm.ct3", "Nirav Adhia",
             "Terminal Manager — CT-3", "operator", "terminal:CT3", "CT3", False, True, pw),
            ("hse.chief@demo.local", "hse.chief", "Dr. Kavita Raval",
             "Chief — HSE & Environment", "authority", "port", "Port Authority", False, True, pw),
            ("finance@demo.local", "finance", "Meenakshi Iyer",
             "Controller — Revenue & Billing", "authority", "port", "Port Authority", False, True, pw),
            ("analyst@demo.local", "analyst", "Ishaan Trivedi",
             "Data Analyst — Port MIS", "authority", "port", "Port Authority", False, True, pw),
        ]
        cur.executemany("""insert into app_users
            (email,username,name,role,persona,scope,org,is_admin,active,pw_hash)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing""", rows)
    conn.commit()
    conn.close()


def _row(cur):
    r = cur.fetchone()
    return dict(r) if r else None


def get_by_login(login):
    """Look up by email OR username (case-insensitive)."""
    conn = _conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("select * from app_users where lower(email)=lower(%s) or lower(username)=lower(%s)",
                    (login, login))
        return _row(cur)
    finally:
        conn.close()


def verify_password(login, password):
    u = get_by_login(login)
    if not u or not u.get("active") or not u.get("pw_hash"):
        return None
    if hmac.compare_digest(u["pw_hash"], hash_pw(password)):
        _touch_login(u["email"])
        return u
    return None


def _touch_login(email):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("update app_users set last_login=now() where email=%s", (email,))
    conn.commit()
    conn.close()


def list_users():
    conn = _conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""select email,username,name,role,persona,scope,org,is_admin,active,
                       created_at,last_login,(pw_hash is not null) has_password
                       from app_users order by is_admin desc, created_at""")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def upsert_user(u):
    conn = _conn()
    cur = conn.cursor()
    pw_hash = hash_pw(u["password"]) if u.get("password") else None
    cur.execute("""
      insert into app_users (email,username,name,role,persona,scope,org,is_admin,active,pw_hash)
      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,coalesce(%s, null))
      on conflict (email) do update set
        username=excluded.username, name=excluded.name, role=excluded.role,
        persona=excluded.persona, scope=excluded.scope, org=excluded.org,
        is_admin=excluded.is_admin, active=excluded.active,
        pw_hash=coalesce(excluded.pw_hash, app_users.pw_hash)""",
      (u["email"].lower(), u.get("username") or u["email"].split("@")[0], u.get("name"),
       u.get("role") or ("Administrator" if u.get("is_admin") else "User"),
       u.get("persona", "authority"), u.get("scope", "port"), u.get("org", "Port Authority"),
       bool(u.get("is_admin")), u.get("active", True), pw_hash))
    conn.commit()
    conn.close()
    return get_by_login(u["email"])


def set_active(email, active):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("update app_users set active=%s where email=%s", (bool(active), email))
    conn.commit()
    conn.close()


def delete_user(email):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("delete from app_users where email=%s and is_admin=false", (email,))
    n = cur.rowcount
    conn.commit()
    conn.close()
    return n


# ---------------------------------------------------------------- OTP
def issue_otp(email, ttl_min=10):
    """Create a code for an ACTIVE user. Returns (code, user) or (None, None)."""
    u = get_by_login(email)
    if not u or not u.get("active"):
        return None, None
    code = f"{random.randint(0, 999999):06d}"
    conn = _conn()
    cur = conn.cursor()
    cur.execute("delete from otp_codes where email=%s", (u["email"],))
    cur.execute("insert into otp_codes (email,code,expires_at) values (%s,%s, now() + interval '%s minutes')",
                (u["email"], code, ttl_min))
    conn.commit()
    conn.close()
    return code, u


def verify_otp(email, code):
    u = get_by_login(email)
    if not u:
        return None
    conn = _conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""select * from otp_codes where email=%s and used=false
                       order by created_at desc limit 1""", (u["email"],))
        row = _row(cur)
        if not row:
            return None
        cur2 = conn.cursor()
        cur2.execute("update otp_codes set attempts=attempts+1 where email=%s", (u["email"],))
        conn.commit()
        if row["attempts"] >= 5:
            return None
        if row["expires_at"] < dt.datetime.now(dt.timezone.utc):
            return None
        if not hmac.compare_digest(str(row["code"]), str(code).strip()):
            return None
        cur2.execute("update otp_codes set used=true where email=%s", (u["email"],))
        conn.commit()
        _touch_login(u["email"])
        return u
    finally:
        conn.close()
