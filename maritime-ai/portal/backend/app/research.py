"""Market-intelligence research agent.

A dedicated agent that does DAILY internet research (Claude CLI with
WebSearch/WebFetch enabled — the only web-enabled path in the backend) on two
standing topics and publishes each run as a dated article:

  ports  — How Mundra stands vs India's major ports (JNPA, Kandla/Deendayal,
           Chennai, Visakhapatnam…) and the regional hubs (Colombo, Jebel Ali,
           Singapore): throughput, turnaround, rankings, the good/bad/ugly.
  rivals — Adani Ports & SEZ's position vs competing port operators (India +
           global terminal operators): moves, concessions, wins/losses and the
           day's published news.

Articles accumulate in a local JSON store (agent_state/research_articles.json —
no external database dependency) and power the two Market Intelligence pages.
A daily digest email goes to every enabled report subscription of kind
'research' (managed in Users & Email → AI reports).
Sources: public web, industry press, government/port-authority reports. No
authenticated social scraping.
"""
import datetime as dt
import json
import os
import re
import threading
import time

from . import config, claude_cli

TOPICS = ("ports", "rivals")
_RUN_HOUR = int(os.environ.get("SAGAR_RESEARCH_HOUR", "7"))   # daily run at 07:00 local
_CLAIM_LOCK = threading.Lock()   # serializes claiming a topic (endpoint + scheduler)
_RUNNING = {}          # topic -> True from claim until the article row is committed
_LAST_ERROR = {}       # topic -> message of the last failed run (cleared on success)
_LAST_FAIL_AT = {}     # topic -> datetime of the last failure (auto-retry backoff)
_FAIL_BACKOFF_S = 4 * 3600   # don't auto-retry a failing topic more often than every 4h

_STORE_LOCK = threading.Lock()
_STORE_PATH = os.path.join(os.path.abspath(config.AGENT_STATE_DIR), "research_articles.json")


def _load_store():
    try:
        doc = json.load(open(_STORE_PATH))
        if isinstance(doc, dict):
            return doc
    except Exception:
        pass
    return {"seq": 0, "articles": []}


def _save_store(doc):
    os.makedirs(os.path.dirname(_STORE_PATH), exist_ok=True)
    json.dump(doc, open(_STORE_PATH, "w"), ensure_ascii=False, indent=1, default=str)


def init():
    """Ensure the local article store exists (no external DB to initialise)."""
    with _STORE_LOCK:
        if not os.path.exists(_STORE_PATH):
            _save_store(_load_store())


# ---------------------------------------------------------------- prompts
_COMMON_RULES = (
    "You are the Market Intelligence analyst inside Sagar Drishti — the AI analytics platform "
    "for Mundra Port operations (Mundra, Kutch, Gujarat: India's largest commercial port — "
    "3 cargo zones, 10 terminals, 24 berths, container + bulk + liquid + ro-ro).\n"
    "Use web search NOW to ground every claim in published sources — port-authority and "
    "ministry (MoPSW/IPA) statistics, industry press, company releases, reputable news. Prefer "
    "2025–2026 material; clearly date anything older. NEVER invent a number, ranking or quote — "
    "if a figure can't be sourced, say what is and isn't publicly known. Cite the source next "
    "to each claim as a markdown link.\n"
    "Write for port and terminal leadership: crisp, factual, decision-oriented English.\n\n"
    "OUTPUT: a single JSON object, nothing else (no code fences):\n"
    '{"title": "<headline, max 90 chars, dated angle>",\n'
    ' "body_md": "<the full article in markdown, 500-900 words>",\n'
    ' "sources": [{"title": "<source name>", "url": "<url>"}, ...]}'
)

_TOPIC_PROMPTS = {
    "ports": (
        "TOPIC — MUNDRA vs INDIA'S MAJOR PORTS and the regional hubs, on cargo throughput and "
        "port performance.\n\nResearch and write today's briefing with these sections:\n"
        "## Where Mundra stands — Mundra's position vs the Indian major ports (JNPA, "
        "Deendayal/Kandla, Visakhapatnam, Chennai, Paradip, Cochin…) and regional hubs "
        "(Colombo, Jebel Ali, Singapore): cargo volume, container throughput (TEU), vessel "
        "turnaround, rankings such as the World Bank/S&P CPPI where sources allow.\n"
        "## The good — where Mundra genuinely leads or improved.\n"
        "## The bad — where Mundra lags its peers.\n"
        "## The ugly — systemic problems (congestion episodes, tariff disputes, environmental "
        "or customs actions, hinterland bottlenecks) at Mundra or in the sector at large.\n"
        "## What it means for Mundra — implications for port operations and commercial "
        "strategy.\n"
        "## Latest developments — any news from the last few weeks on Indian ports policy "
        "(MoPSW, Sagarmala, Maritime India Vision) or west-coast port performance, each item "
        "sourced."
    ),
    "rivals": (
        "TOPIC — ADANI PORTS & SEZ vs ITS COMPETITORS in port and terminal operations, India "
        "first, global context second.\n\nResearch and write today's briefing with these "
        "sections:\n"
        "## APSEZ's position — Adani Ports & SEZ's footprint & recent moves (Mundra's terminal "
        "JVs with DP World/MSC/CMA CGM lineage, acquisitions, capacity additions, overseas "
        "terminals).\n"
        "## Competitor moves — what rivals are doing: Indian operators (JNPA and the major "
        "ports landlord model, JSW Infrastructure, Essar Ports) and global terminal operators "
        "(DP World, PSA International, APM Terminals/Maersk, Hutchison Ports, CMA CGM "
        "terminals). Concession wins, expansions, exits, tech launches.\n"
        "## Tenders & concessions — fresh or upcoming port/terminal concessions, PPP awards "
        "and privatisations.\n"
        "## Reputation & risk — anything published on service quality, disputes, regulatory or "
        "environmental action for APSEZ or rivals.\n"
        "## Today's news digest — bullet list of the latest relevant headlines, each with "
        "source.\n"
        "## Implications for Mundra — so-what for leadership in 3-5 bullets."
    ),
}


# ---------------------------------------------------------------- run
def _parse_article(raw):
    """Extract {title, body_md, sources} from the model output, tolerantly."""
    txt = (raw or "").strip()
    m = re.search(r"\{.*\}", txt, re.S)
    if m:
        try:
            d = json.loads(m.group(0))
            if d.get("body_md"):
                return {"title": (d.get("title") or "").strip()[:200],
                        "body_md": d["body_md"],
                        "sources": [s for s in (d.get("sources") or [])
                                    if isinstance(s, dict)
                                    and str(s.get("url", "")).startswith(("http://", "https://"))]}
        except Exception:
            pass
    # fallback: keep the raw text as the article body
    return {"title": "", "body_md": txt, "sources": []}


def _claim(topic):
    """Atomically claim a topic for a run. Returns False if one is already in flight."""
    with _CLAIM_LOCK:
        if _RUNNING.get(topic):
            return False
        _RUNNING[topic] = True
        return True


def _run_claimed(topic):
    """The run body for a topic we have ALREADY claimed. Clears the claim when done.
    _RUNNING stays true until the article is COMMITTED to the store, so a status
    poll never reports 'idle' while the feed is still missing the new article."""
    try:
        today = dt.date.today().strftime("%d %b %Y")
        prompt = (f"Today is {today}.\n\n{_TOPIC_PROMPTS[topic]}")
        raw = claude_cli.complete(prompt, system=_COMMON_RULES, model=config.AGENT_MODEL,
                                  timeout=900, web=True)
        art = _parse_article(raw)
        if not art["title"]:
            art["title"] = ("Mundra vs India's major ports — benchmark briefing" if topic == "ports"
                            else "Adani Ports vs competitors — market briefing") + f" · {today}"
        with _STORE_LOCK:
            doc = _load_store()
            doc["seq"] = int(doc.get("seq", 0)) + 1
            art.update({"id": doc["seq"], "topic": topic,
                        "created_at": dt.datetime.now().isoformat(timespec="seconds")})
            doc["articles"].append(art)
            doc["articles"] = doc["articles"][-400:]
            _save_store(doc)
        _LAST_ERROR.pop(topic, None)
        _LAST_FAIL_AT.pop(topic, None)
        return art
    except Exception as e:
        _LAST_ERROR[topic] = f"{type(e).__name__}: {str(e)[:300]}"
        _LAST_FAIL_AT[topic] = dt.datetime.now()
        raise
    finally:
        _RUNNING[topic] = False


def run_topic(topic):
    """One live research run (blocking, 2-8 min). Raises if one is already in flight."""
    if topic not in TOPICS:
        raise ValueError("unknown research topic")
    if not _claim(topic):
        raise RuntimeError("a research run for this topic is already in progress")
    return _run_claimed(topic)


def start_async(topic):
    """Claim the topic and run it on a daemon thread. Returns False if already running."""
    if topic not in TOPICS:
        raise ValueError("unknown research topic")
    if not _claim(topic):
        return False

    def _worker():
        try:
            _run_claimed(topic)
        except Exception:
            pass                  # error already recorded in _LAST_ERROR
    threading.Thread(target=_worker, daemon=True).start()
    return True


def articles(topic, limit=30):
    with _STORE_LOCK:
        doc = _load_store()
    rows = [a for a in doc.get("articles", []) if a.get("topic") == topic]
    rows.sort(key=lambda a: str(a.get("created_at") or ""), reverse=True)
    return [dict(a) for a in rows[:max(1, int(limit))]]


def status():
    with _STORE_LOCK:
        doc = _load_store()
    st = {t: {"articles": 0, "last_run": None, "running": bool(_RUNNING.get(t)),
              "last_error": _LAST_ERROR.get(t)} for t in TOPICS}
    for a in doc.get("articles", []):
        t = a.get("topic")
        if t in st:
            st[t]["articles"] += 1
            ca = str(a.get("created_at") or "")
            if not st[t]["last_run"] or ca > st[t]["last_run"]:
                st[t]["last_run"] = ca
    return st


# ---------------------------------------------------------------- digest email
def _digest_html(arts):
    """Digest HTML. Title/source fields come from a web-grounded LLM run, so they are
    UNTRUSTED — escape everything and only link http(s) URLs (anti-phishing)."""
    import html as _h
    from .reports import md_to_html
    parts = ["<div style='font-family:Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto'>",
             "<h1 style='color:#0d3b66;border-bottom:3px solid #0d3b66;padding-bottom:8px'>"
             "Sagar Drishti — Market Intelligence Daily</h1>"]
    for a in arts:
        parts.append(f"<h2 style='color:#0d3b66;margin-top:28px'>{_h.escape(a['title'] or '')}</h2>")
        parts.append(md_to_html(a["body_md"]))
        srcs = [s for s in (a.get("sources") or [])
                if str(s.get("url", "")).startswith(("http://", "https://"))]
        if srcs:
            items = "".join(
                f'<li><a href="{_h.escape(s["url"], quote=True)}">'
                f'{_h.escape(s.get("title") or s["url"])}</a></li>' for s in srcs)
            parts.append(f"<p><b>Sources</b></p><ul>{items}</ul>")
        parts.append("<hr style='border:none;border-top:1px solid #ddd;margin:24px 0'>")
    parts.append("<p style='color:#777;font-size:12px'>Generated by the Sagar Drishti research "
                 "agent from public sources. Verify before external use.</p></div>")
    return "".join(parts)


def send_digest(sub):
    """Email the latest article per topic to a kind='research' subscription's recipients."""
    from . import mailer
    latest = [a for t in TOPICS for a in articles(t, limit=1)]
    if not latest:
        return 0, ["no research articles yet — run the agent first"]
    html = _digest_html(latest)
    subj = "Market Intelligence Daily — port benchmark & competitor watch · " + \
           dt.date.today().strftime("%d %b %Y")
    text = "\n\n\n".join(a["title"] + "\n\n" + a["body_md"] for a in latest)
    sent, errs = 0, []
    for r in (sub.get("recipients") or []):
        to = (r.get("email") or "").strip()
        if "@" not in to:
            continue
        ok, detail = mailer.send(to, subj, html, text=text)
        if ok:
            sent += 1
        else:
            errs.append(f"{to}: {detail}")
    return sent, errs


# ---------------------------------------------------------------- daily scheduler
def run_daily(force=False):
    """Run any topic with no article yet today, then email the due digest lists.

    Research digests are sent ONLY from here (reports_db._due skips kind='research',
    so the hourly report scheduler can't double-send). Cadence is honoured via
    reports_db._due; the admin 'send now' button still works via run_due(force_id).
    """
    out = []
    today = dt.date.today()
    now = dt.datetime.now()
    for t in TOPICS:
        if _RUNNING.get(t):
            continue                      # a manual run is in flight — let it finish
        fail_at = _LAST_FAIL_AT.get(t)
        if not force and fail_at and (now - fail_at).total_seconds() < _FAIL_BACKOFF_S:
            continue                      # failing topic: back off, don't hammer the web
        arts = articles(t, limit=1)
        fresh = arts and str(arts[0]["created_at"])[:10] == str(today)
        if fresh and not force:
            continue
        try:
            art = run_topic(t)
            out.append({"topic": t, "id": art["id"], "title": art["title"]})
        except Exception as e:
            out.append({"topic": t, "error": f"{type(e).__name__}: {e}"})
    if out and not any("error" in o for o in out):
        try:
            from . import reports_db
            due_now = dt.datetime.now(dt.timezone.utc)
            for sub in reports_db.list_subs():
                if sub.get("kind") != "research" or not sub.get("enabled"):
                    continue
                if reports_db.research_due(sub, due_now):
                    reports_db.send_sub(sub)
        except Exception as e:
            out.append({"digest_error": str(e)})
    return out


_started = False


def start_scheduler():
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            time.sleep(1800)          # check every 30 min
            try:
                if dt.datetime.now().hour >= _RUN_HOUR:
                    run_daily()       # no-op if today's articles already exist
            except Exception:
                pass

    threading.Thread(target=loop, daemon=True).start()
