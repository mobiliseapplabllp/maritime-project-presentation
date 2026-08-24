"""Report subscriptions — who receives which AI summary, how often.

A subscription = {name, kind, cadence, enabled, recipients:[{email, scope}]}.
Each recipient gets build_report(kind, scope): same scope for everyone = a
BROADCAST (e.g. the port exec brief); different scope per recipient =
PERSONALIZED (each terminal head gets their terminal, each zone head their zone).
A background thread sends the due ones. Nothing sends until an admin creates &
enables a subscription.
"""
import datetime as dt
import json
import os
import threading
import time

import psycopg2
import psycopg2.extras

DB = os.environ.get("SAGAR_PG_DB", "sagar_drishti")

DDL = """
create table if not exists report_subscriptions (
  id          serial primary key,
  name        text,
  kind        text,                     -- port|zone|terminal|berth|crew|vessel|research
  cadence     text default 'weekly',    -- daily|weekly|monthly
  enabled     boolean default true,
  recipients  jsonb default '[]',       -- [{"email":..,"scope":..}]
  last_sent   timestamptz,
  created_at  timestamptz default now()
);
"""


def _conn():
    return psycopg2.connect(dbname=DB, connect_timeout=5)


def init():
    c = _conn(); cur = c.cursor(); cur.execute(DDL); c.commit(); c.close()


def list_subs():
    c = _conn(); cur = c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("select * from report_subscriptions order by created_at")
    rows = cur.fetchall(); c.close()
    return [dict(r) for r in rows]


def upsert_sub(s):
    c = _conn(); cur = c.cursor()
    recips = json.dumps(s.get("recipients") or [])
    if s.get("id"):
        cur.execute("""update report_subscriptions set name=%s, kind=%s, cadence=%s,
                       enabled=%s, recipients=%s where id=%s""",
                    (s.get("name"), s.get("kind"), s.get("cadence", "weekly"),
                     bool(s.get("enabled", True)), recips, s["id"]))
    else:
        cur.execute("""insert into report_subscriptions (name, kind, cadence, enabled, recipients)
                       values (%s,%s,%s,%s,%s)""",
                    (s.get("name"), s.get("kind"), s.get("cadence", "weekly"),
                     bool(s.get("enabled", True)), recips))
    c.commit(); c.close()


def delete_sub(sid):
    c = _conn(); cur = c.cursor()
    cur.execute("delete from report_subscriptions where id=%s", (sid,))
    c.commit(); c.close()


def _cadence_due(sub, now):
    """Pure cadence check: has enough time passed since last_sent?"""
    ls = sub.get("last_sent")
    if not ls:
        return True
    delta = now - ls
    cad = sub.get("cadence", "weekly")
    if cad == "daily":
        return delta.total_seconds() >= 20 * 3600
    if cad == "weekly":
        return delta.days >= 7
    if cad == "monthly":
        return delta.days >= 28
    return False


def _due(sub, now):
    if not sub.get("enabled"):
        return False
    if sub.get("kind") == "research":
        # research digests are dispatched ONLY by research.run_daily (right after fresh
        # articles are generated) — never by this hourly loop, or subscribers would get
        # a second, stale copy each day. Send-now (run_due force_id) still works.
        return False
    return _cadence_due(sub, now)


def research_due(sub, now):
    """Used by research.run_daily to honour the list's cadence."""
    return _cadence_due(sub, now)


def send_sub(sub):
    """Generate + email the report to every recipient. Returns (sent, errors)."""
    from . import reports, mailer
    if sub.get("kind") == "research":     # market-intelligence digest, not a PDF report
        from . import research
        sent, errs = research.send_digest(sub)
        c = _conn(); cur = c.cursor()
        cur.execute("update report_subscriptions set last_sent=now() where id=%s", (sub["id"],))
        c.commit(); c.close()
        return sent, errs
    sent, errs = 0, []
    for r in (sub.get("recipients") or []):
        to = (r.get("email") or "").strip()
        if "@" not in to:
            continue
        scope = (r.get("scope") or "").strip() or None
        try:
            rep, pdf = reports.report_pdf(sub.get("kind"), scope)
            html = reports.render_html(rep, for_email=True)
            fname = (rep["title"].replace(" ", "_")[:60] or "report") + ".pdf"
            ok, detail = mailer.send(to, rep["title"], html, text=rep["ai_md"],
                                     attachments=[(fname, pdf, "application/pdf")])
            if ok:
                sent += 1
            else:
                errs.append(f"{to}: {detail}")
        except Exception as e:
            errs.append(f"{to}: {type(e).__name__}")
    c = _conn(); cur = c.cursor()
    cur.execute("update report_subscriptions set last_sent=now() where id=%s", (sub["id"],))
    c.commit(); c.close()
    return sent, errs


def run_due(force_id=None):
    now = dt.datetime.now(dt.timezone.utc)
    out = []
    for sub in list_subs():
        if force_id is not None and sub["id"] != force_id:
            continue
        if force_id is not None or _due(sub, now):
            sent, errs = send_sub(sub)
            out.append({"id": sub["id"], "name": sub["name"], "sent": sent, "errors": errs})
    return out


# ---- hourly scheduler (daemon) ----
_started = False


def start_scheduler():
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            time.sleep(3600)
            try:
                run_due()
            except Exception:
                pass

    threading.Thread(target=loop, daemon=True).start()
