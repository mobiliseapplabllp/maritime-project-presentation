"""
Chatbot endpoint — hybrid built-in data assistant + Claude LLM.

1. Built-in intent handlers answer common questions instantly from the panels
   (findings, longest-waiting units, receivables, vessel watchlist, unit
   lookup, overview), scoped to the caller's RBAC scope. Works offline, no
   API key.
2. Otherwise the local Claude CLI answers free-form, grounded in the scoped
   context pack. "Sagar Drishti" is the assistant's name.
"""
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import current_user
from .data import get_store
from . import config, claude_cli, creative, rag

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])


class ChatIn(BaseModel):
    message: str
    history: list = []
    mode: str = "concise"          # concise | report | docs | voice
    lang: str = "en"
    voice_gender: str = "female"


# English is the key language. Hindi and Gujarati (the port is in Gujarat) are
# the two supported second languages for the chatbot, voice and AI assistant.
LANG_RULES = {
    "hi": ("\n\nLANGUAGE: उत्तर पूरी तरह हिन्दी में दें। तकनीकी शब्द (turnaround, berth, TEU, "
           "PSC, ETA) अंग्रेज़ी में ही रखें और आवश्यकता हो तो कोष्ठक में अर्थ दें। "
           "संख्याएँ, IMO नंबर और टर्मिनल/जहाज़ के नाम ज्यों-के-त्यों रखें। Markdown संरचना बनाए रखें।"),
    "gu": ("\n\nLANGUAGE: ઉત્તર સંપૂર્ણ ગુજરાતીમાં આપો. ટેકનિકલ શબ્દો (turnaround, berth, TEU, "
           "PSC, ETA) અંગ્રેજીમાં જ રાખો અને જરૂર હોય તો કૌંસમાં અર્થ આપો. "
           "સંખ્યાઓ, IMO નંબર અને ટર્મિનલ/જહાજનાં નામ યથાવત્ રાખો. Markdown માળખું જાળવી રાખો."),
}


def lang_rule(lang: str) -> str:
    return LANG_RULES.get(lang, "")


def _num(x):
    try:
        return float(x)
    except Exception:
        return None


def _mmt(x):
    """Cargo tonnes -> million-tonne display string."""
    v = _num(x)
    return f"{v/1e6:.2f} MMT" if v is not None else "—"


# ---------------------------------------------------------------------------
# Built-in intent handlers (scoped)
# ---------------------------------------------------------------------------
def builtin_answer(msg: str, user):
    s = get_store()
    q = msg.lower().strip()
    # Complex analytical phrasings must reach the LLM+SQL path — keyword builtins
    # only serve short, simple asks (QA loop caught builtins hijacking hard questions).
    if len(q.split()) > 14 or any(w in q for w in
            ["both", "simultaneously", "due to", "correlat", "compare", "versus", " vs ",
             "trend over", "combined with", "along with", "cross"]):
        return None
    lm = s.latest_month
    bm = s.benchmark or {}
    vis = s.visible(s.unit_latest, user)
    child = s.child_level(user)
    units = vis[vis.level == child]

    # findings / anomalies
    if any(w in q for w in ["anomal", "finding", "issue", "risk", "red flag", "wrong", "problem"]):
        highs = [f for f in s.findings if f.get("severity") == "high"]
        lines = [f"I've flagged **{len(s.findings)} findings** ({len(highs)} high-severity). The headline concerns:"]
        for f in highs[:5]:
            lines.append(f"• **{f['title']}** — {f['inference']}")
        return {"reply": "\n".join(lines), "source": "builtin",
                "table": {"title": "High-severity findings", "columns": ["ID", "Area", "Finding"],
                          "rows": [[f["id"], f["area"], f["title"]] for f in highs]}}

    # anchorage waiting / berth congestion
    if any(w in q for w in ["waiting", "congest", "queue", "anchorage", "pre-berthing", "preberthing", "delay"]):
        if "avg_waiting_hr" in units.columns:
            top = units.dropna(subset=["avg_waiting_hr"]).sort_values("avg_waiting_hr", ascending=False).head(8)
            tgt = _num(bm.get("preberthing_target_hr")) or 5.0
            items = [{"name": r.unit_name, "v": round(float(r.avg_waiting_hr), 1)} for _, r in top.iterrows()]
            return {"reply": f"Longest pre-berthing waits ({lm}) in your scope — mean hours at anchorage "
                    "before berthing: "
                    + ", ".join(f"{r.unit_name} ({r.avg_waiting_hr:.1f}h)" for _, r in top.head(5).iterrows())
                    + f". The major-port pre-berthing benchmark is ~{tgt:.0f}h.",
                    "source": "builtin",
                    "chart": {"type": "bars", "title": f"Avg waiting at anchorage, hr ({lm})", "items": items}}

    # slowest turnaround
    if "turnaround" in q or "turn around" in q or "slowest" in q or "laytime" in q:
        if "avg_turnaround_hr" in units.columns:
            top = units.dropna(subset=["avg_turnaround_hr"]).sort_values("avg_turnaround_hr", ascending=False).head(8)
            tgt = _num(bm.get("turnaround_target_hr")) or 50.4
            items = [{"name": r.unit_name, "v": round(float(r.avg_turnaround_hr), 1)} for _, r in top.iterrows()]
            return {"reply": f"Slowest vessel turnaround ({lm}) in your scope — mean hours arrival → sailing: "
                    + ", ".join(f"{r.unit_name} ({r.avg_turnaround_hr:.1f}h)" for _, r in top.head(5).iterrows())
                    + f". The major-ports average is {tgt:.1f}h (cargo mix matters — bulk runs longer than boxes).",
                    "source": "builtin",
                    "chart": {"type": "bars", "title": f"Avg turnaround, hr ({lm})", "items": items}}

    # HSE incidents
    if any(w in q for w in ["incident", "safety", "hse", "spill", "injur", "near miss", "near-miss", "accident"]):
        k = (getattr(s, "sections", {}) or {}).get("incidents", {}).get("kpis", {})
        if "incidents_total" in units.columns:
            top = units.sort_values("incidents_total", ascending=False).head(8)
            items = [{"name": r.unit_name, "v": int(r.incidents_total or 0)} for _, r in top.iterrows()]
            head = (f"HSE picture — {int(k.get('total', 0)):,} incidents on record "
                    f"({int(k.get('high_critical', 0)):,} high/critical, {int(k.get('injuries', 0)):,} injuries, "
                    f"{int(k.get('spills', 0)):,} spills). ") if k else ""
            return {"reply": head + f"Most incidents ({lm}) in your scope: "
                    + ", ".join(f"{r.unit_name} ({int(r.incidents_total or 0)})" for _, r in top.head(4).iterrows()) + ".",
                    "source": "builtin",
                    "chart": {"type": "bars", "title": f"HSE incidents ({lm})", "items": items}}

    # PSC inspections / detentions
    if any(w in q for w in ["detention", "detain", "psc", "inspection", "port state"]):
        k = (getattr(s, "sections", {}) or {}).get("inspections", {}).get("kpis", {})
        wl = s.frames.get("vessel_watchlist")
        lines = [f"PSC/FSI inspections on record: **{int(k.get('done', 0))}** with "
                 f"**{int(k.get('findings', 0))} findings** and **{int(k.get('detentions', 0))} detentions**."
                 if k else "Inspection summary is unavailable."]
        if wl is not None and len(wl):
            det = wl[wl.detentions > 0].head(6)
            if len(det):
                lines.append("Vessels with detentions on the watchlist: "
                             + ", ".join(f"{r.vessel} ({int(r.detentions)})" for _, r in det.iterrows()) + ".")
        if "detentions" in units.columns:
            top = units[units.detentions > 0].sort_values("detentions", ascending=False).head(8)
            if len(top):
                items = [{"name": r.unit_name, "v": int(r.detentions)} for _, r in top.iterrows()]
                return {"reply": "\n".join(lines), "source": "builtin",
                        "chart": {"type": "bars", "title": f"Detentions ({lm})", "items": items}}
        return {"reply": "\n".join(lines), "source": "builtin"}

    # receivables / collections
    if any(w in q for w in ["outstanding", "receivab", "collection", "dues", "billing", "invoice", "revenue"]):
        home = vis[vis.unit_id == s.home_unit_id(user)]
        out_cr = _num(home.iloc[0].get("outstanding_cr")) if len(home) else 0
        col = _num(home.iloc[0].get("collection_pct")) if len(home) else None
        top = (units.sort_values("outstanding_cr", ascending=False).head(6)
               if "outstanding_cr" in units.columns else units.head(0))
        items = [{"name": r.unit_name, "v": round(float(r.outstanding_cr or 0), 2)} for _, r in top.iterrows()]
        return {"reply": f"Your scope carries **₹{out_cr or 0:,.2f} Cr outstanding** receivables"
                + (f" (cumulative collection {col:.1f}% vs the 95% benchmark)" if col is not None else "")
                + ". Highest-exposure "
                + ("units: " + ", ".join(f"{r.unit_name} (₹{float(r.outstanding_cr or 0):,.2f} Cr)"
                                         for _, r in top.head(4).iterrows()) if len(top) else "none in scope."),
                "source": "builtin",
                "chart": {"type": "bars", "title": "Outstanding receivables (₹ Cr)", "items": items}}

    # vessel watchlist (risk-scored callers)
    if "watchlist" in q or ("vessel" in q and any(w in q for w in ["worst", "risk", "watch", "flag", "top"])):
        wl = s.frames.get("vessel_watchlist")
        if wl is not None and len(wl):
            top = wl.head(10)
            lines = [f"{i+1}. **{r.vessel}** (IMO {r.imo}, {r.type}) — watch score {r.watch_score:.0f}: "
                     f"{int(r.calls)} calls, {int(r.incidents)} incidents, {int(r.findings)} inspection "
                     f"findings, {int(r.detentions)} detention(s)"
                     for i, (_, r) in enumerate(top.iterrows())]
            items = [{"name": str(r.vessel)[:24], "v": round(float(r.watch_score), 1)} for _, r in top.iterrows()]
            return {"reply": "Vessel watchlist — repeat callers ranked by composite watch score (incidents, "
                    "inspection findings, detentions per call):\n" + "\n".join(lines) +
                    "\n\nThe 8 documented liner callers keep clean records and are excluded by design.",
                    "source": "builtin",
                    "chart": {"type": "bars", "title": "Vessel watch score", "items": items}}

    # vessel-type reliability
    if "vessel type" in q or "reliab" in q or "which type" in q or "by type" in q:
        dev = s.frames.get("vessel_reliability")
        if dev is not None and len(dev):
            top = dev.head(6)
            items = [{"name": str(r.vessel_type), "v": round(float(r.incidents_per_100_calls), 1)}
                     for _, r in top.iterrows()]
            return {"reply": "Incident-prone vessel types (incidents per 100 calls): "
                    + ", ".join(f"{r.vessel_type} ({r.incidents_per_100_calls:.1f})"
                                for _, r in top.head(4).iterrows())
                    + ". Turnaround differs by trade too — "
                    + ", ".join(f"{r.vessel_type} {r.avg_turnaround_hr:.0f}h" for _, r in top.head(3).iterrows()) + ".",
                    "source": "builtin",
                    "chart": {"type": "bars", "title": "Incidents per 100 calls", "items": items}}

    # crew / seafarers
    if any(w in q for w in ["crew", "seafarer", "manning", "certificate", "sign-on", "sign on"]):
        k = (getattr(s, "sections", {}) or {}).get("crew", {}).get("kpis", {})
        if k:
            return {"reply": f"Crewing picture: **{int(k.get('seafarers', 0))} seafarers** on the roster, "
                    f"**{int(k.get('onboard', 0))} currently onboard** port craft, and "
                    f"**{int(k.get('cert_expired', 0))} expired certificate(s)** needing renewal. "
                    "The Crew deep-analysis page has the full roster and certificate matrix.",
                    "source": "builtin"}

    # unit lookup by name or code (any visible berth/terminal/zone — finest grain first,
    # so "CT3-1" resolves to the berth and plain "CT3" to the terminal)
    lookup = vis[vis.level.isin(["zone", "terminal", "berth"])] if len(vis) else vis
    _order = {"berth": 0, "terminal": 1, "zone": 2}
    lookup = lookup.assign(_lvl=lookup.level.map(_order)).sort_values("_lvl") if len(lookup) else lookup
    for _, r in lookup.iterrows():
        nm, uid = str(r.unit_name), str(r.unit_id)
        hit = (len(nm) > 3 and nm.lower() in q) or \
              (len(uid) >= 3 and re.search(r"\b" + re.escape(uid.lower()) + r"\b", q))
        if hit:
            ops = s.frames.get("ops")
            traj = ops[ops.unit_id == r.unit_id].sort_values("ym") if ops is not None else None
            series = ([{"ym": t.ym, "v": t.avg_turnaround_hr} for _, t in traj.iterrows()]
                      if traj is not None else [])
            return {"reply": f"**{nm}** — {lm}: **{int(r.vessel_calls or 0)} vessel calls**, "
                    f"{_mmt(r.cargo_mt)} cargo, turnaround {_num(r.avg_turnaround_hr) or 0:.1f}h, "
                    f"waiting {_num(r.avg_waiting_hr) or 0:.1f}h, occupancy "
                    f"{_num(r.get('occupancy_pct')) or 0:.1f}%, {int(r.get('incidents_total') or 0)} incidents, "
                    f"₹{_num(r.get('outstanding_cr')) or 0:,.2f} Cr outstanding.",
                    "source": "builtin",
                    "chart": {"type": "line", "title": f"{nm} — avg turnaround (hr) over time", "series": series}}

    # traffic / cargo trend
    if any(w in q for w in ["traffic", "throughput", "cargo", "teu", "vessel calls", "volume", "tonnage"]):
        ops = s.frames.get("ops")
        home_id = s.home_unit_id(user)
        if ops is not None:
            hs = ops[(ops.unit_id == home_id) &
                     (ops.ym.astype(str) <= str(lm))].sort_values("ym").tail(13)
            if len(hs) >= 2:
                last, prev = hs.iloc[-1], hs.iloc[-2]
                series = [{"ym": t.ym, "v": int(t.vessel_calls or 0)} for _, t in hs.iterrows()]
                return {"reply": f"**{last.unit_name}** traffic — {lm}: **{int(last.vessel_calls or 0)} calls**, "
                        f"{_mmt(last.cargo_mt)} cargo, {int(_num(last.teu) or 0):,} TEU "
                        f"(previous month {int(prev.vessel_calls or 0)} calls, {_mmt(prev.cargo_mt)}).",
                        "source": "builtin",
                        "chart": {"type": "line", "title": f"{last.unit_name} — vessel calls per month",
                                  "series": series}}

    # overview / summary
    if any(w in q for w in ["overview", "summary", "how are we", "how is", "status"]):
        home = vis[vis.unit_id == s.home_unit_id(user)]
        if len(home):
            r = home.iloc[0]
            tgt = _num(bm.get("turnaround_target_hr")) or 50.4
            return {"reply": f"**{r.unit_name}** ({lm}): **{int(r.vessel_calls or 0)} vessel calls**, "
                    f"{_mmt(r.cargo_mt)} cargo, {int(_num(r.teu) or 0):,} TEU. Turnaround "
                    f"{_num(r.avg_turnaround_hr) or 0:.1f}h (majors avg {tgt:.1f}h), waiting "
                    f"{_num(r.avg_waiting_hr) or 0:.1f}h, occupancy {_num(r.get('occupancy_pct')) or 0:.1f}%. "
                    f"{int(r.get('incidents_total') or 0)} HSE incidents, "
                    f"{int(r.get('detentions') or 0)} detention(s), "
                    f"₹{_num(r.get('outstanding_cr')) or 0:,.2f} Cr receivables outstanding.",
                    "source": "builtin"}
    return None


# ---------------------------------------------------------------------------
# LLM path
# ---------------------------------------------------------------------------
def _persona(user):
    who = ("a terminal/zone operator (operational lens — my berths, my vessel service levels, my "
           "receivables)" if (user or {}).get("persona") == "operator"
           else "the port administration (assurance lens — is the port serving vessels efficiently, "
           "safely and profitably?)")
    return ("You are Sagar Drishti, the port operations analyst — the AI inside Sagar Drishti, "
            "the Maritime AI Analytics portal (the port, reference deployment). You are answering for "
            f"{who}. Answer questions about vessel traffic and cargo throughput, turnaround and "
            "anchorage waiting, berth occupancy, marine services (pilotage/tugs), HSE incidents, "
            "PSC inspections and detentions, and billing/receivables.")

_RULES = ("Ground rules you MUST respect:\n"
          "- Use ONLY the DATA provided below (it is already filtered to THIS user's scope — never claim "
          "data outside their scope). Never invent numbers; cite exact figures and unit names from the DATA.\n"
          "- The service yardstick is vessel TURNAROUND (hours anchorage-arrival → sailing) read together "
          "with pre-berthing WAITING and berthed_lt6h_pct (share berthed within 6h — the customer-facing "
          "service level). Judge them against the public major-port benchmarks in the DATA, and respect "
          "cargo mix: bulk parcels legitimately run longer than container calls.\n"
          "- Keep the FOUR panels distinct — never blend them: ops (calls/cargo/turnaround/occupancy), "
          "marine services (pilotage, tugs, inspections, detentions), HSE (incidents/injuries/spills), "
          "revenue (billed/collected/outstanding ₹ crore). Detentions are PSC/FSI vessel detentions, not "
          "a port fine.\n"
          "- Berth is the finest grain. The composite risk_score (0-100) weighs incident rate 35, waiting "
          "25, high-severity incidents 25, detentions 15 over the trailing 12 months.\n"
          "- When asked where data comes from, point to the Data Catalogue tab (port operations snapshot "
          "→ Postgres → panels).\n"
          "- If the answer is not in the DATA, say so briefly.")

_CHARTS = ("CHARTS: When a comparison, ranking or trend would be clearer as a picture, embed one or two "
           "charts using a fenced ```chart code block containing ONLY valid JSON. Schemas:\n"
           '  {"type":"bar","title":"...","unit":"hr","data":[{"name":"CT1","value":38.1}]}\n'
           '  {"type":"line","title":"...","unit":"calls","series":[{"name":"vessel_calls","points":[{"x":"2026-01","y":29}]}]}\n'
           "Rules: max ~12 bars; values straight from the DATA; caption each chart in the prose.")

_CONCISE = ("Answer in 2–5 sentences. Light markdown, specific numbers. Include a ```chart block when the "
            "user asks for a comparison, ranking or trend. You may end by pointing to the relevant tab.")
_REPORT = ("Produce a structured markdown REPORT: a `## Title`; a short **Executive summary**; `###` "
           "sections; markdown tables for rankings; 1–3 ```chart blocks; and a final `### Recommendation` "
           "with concrete prioritised next steps. Every claim tied to a number from the DATA.")


def _history_text(history):
    lines = []
    for h in (history or [])[-6:]:
        role, content = h.get("role"), str(h.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            lines.append(f"{'User' if role == 'user' else 'Assistant'}: {content}")
    return "\n".join(lines)


DATA_SOURCES = [
    "Port Operations Portal — vessel calls, berth events, marine service jobs, HSE incidents, "
    "PSC inspections, billing; deterministic demo world replicated read-only into PostgreSQL.",
    "Derived monthly panels (ops/marine/hse/revenue) at port → zone → terminal → berth grain.",
    "Major-port benchmark (public statistics: turnaround ~50.4h, pre-berthing ~5h, collection 95%) — "
    "the comparison yardstick.",
    "Analysis engine: Sagar Drishti automated findings + the Sagar Drishti analyst (this portal).",
]


_SQL_TOOL = (
    "DATABASE ACCESS: Besides the DATA summary above, you can query the FULL replicated port-operations "
    "database. If the DATA summary does not contain what the user asks (row-level, per-vessel, "
    "per-person, time-sliced or unusual questions), reply with ONLY a fenced ```sql code block "
    "containing 1-3 PostgreSQL SELECT statements (each on its own line, ';'-separated) and NOTHING "
    "else — I will execute them and hand you the results for your final answer. Prefer aggregates; "
    "always alias columns readably; respect the documented join keys and date formats; LIMIT 60.\n\n")


def _extract_sql(text):
    """Pull SELECT statements out of a ```sql fenced block (if the reply is only that)."""
    m = re.search(r"```sql\s*(.*?)```", text or "", re.S | re.I)
    if not m:
        return None
    prose = re.sub(r"```sql\s*.*?```", "", text, flags=re.S | re.I).strip()
    if len(prose) > 200:  # model answered AND queried — treat as final answer
        return None
    stmts = [x.strip() for x in m.group(1).split(";") if x.strip()]
    return stmts[:3] or None


def _complete(system, prompt, mode):
    if claude_cli.available():
        return claude_cli.complete(prompt, system=system), "claude_cli"
    if config.ANTHROPIC_API_KEY:
        import anthropic
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        resp = client.messages.create(model=config.LLM_MODEL,
                                      max_tokens=8000 if mode == "report" else 1200,
                                      system=system, messages=[{"role": "user", "content": prompt}])
        return ("".join(b.text for b in resp.content if b.type == "text") or "(no answer)",
                "anthropic_api")
    return None, None


def _learned_rules():
    """Validated corrections from the QA loop — the chatbot's earned memory."""
    try:
        from .qa import get_lessons
        ls = get_lessons(6)
        if not ls:
            return ""
        return ("\n\nLEARNED CORRECTIONS (from the QA validation loop — obey these):\n- "
                + "\n- ".join(ls))
    except Exception:
        return ""


def llm_answer(msg, history, mode, user, lang="en"):
    from . import pg_query
    s = get_store()
    style = _REPORT if mode == "report" else _CONCISE
    data_json = json.dumps(s.context_pack(user), ensure_ascii=False, default=str)
    system = (f"{_persona(user)}\n\n{_RULES}{_learned_rules()}\n\n{_SQL_TOOL}{pg_query.SCHEMA_DOC}\n\n{_CHARTS}\n\n"
              f"Output style: {style}{lang_rule(lang)}\n\nDATA (JSON, scoped to this user):\n{data_json}")
    hist = _history_text(history)
    user_prompt = (f"{hist}\n\nUser: {msg}" if hist else msg)
    extra = {"data_sources": DATA_SOURCES} if mode == "report" else {}

    text, source = _complete(system, user_prompt, mode)
    if text is None:
        return None

    stmts = _extract_sql(text)
    if stmts:
        results = []
        for q in stmts:
            r = pg_query.run_select(q)
            results.append({"query": q, **r})
        follow = (f"{user_prompt}\n\n[SQL RESULTS from the live database]\n"
                  + json.dumps(results, ensure_ascii=False, default=str)[:20000]
                  + "\n\nNow give the final answer to the user from these results (cite real "
                    "values; mention if a result was truncated or errored). Do NOT emit another "
                    "sql block.")
        text2, _ = _complete(system, follow, mode)
        if text2:
            extra["sql_queries"] = [r["query"] for r in results]
            return {"reply": text2, "source": f"{source}+sql", **extra}
    return {"reply": text, "source": source, **extra}


def _creative_grounding(user):
    s = get_store()
    home = s.unit_latest[s.unit_latest.unit_id == s.home_unit_id(user)]
    lines = ["- Port Authority (REFPT), reference deployment — India's largest commercial port; "
             "benchmarks are public major-port statistics."]
    if len(home):
        r = home.iloc[0]
        lines.append(f"- {r.unit_name} {s.latest_month}: {int(r.vessel_calls or 0)} vessel calls, "
                     f"{_mmt(r.cargo_mt)} cargo, turnaround {_num(r.avg_turnaround_hr) or 0:.1f}h.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# VOICE mode
# ---------------------------------------------------------------------------
_VOICE_PERSONA = (
    "You are Sagar Drishti in a live VOICE conversation inside Sagar Drishti (Port Authority AI "
    "Analytics, reference deployment). The user is SPEAKING and your reply will be READ ALOUD. Rules:\n"
    "- Reply as natural speech: 1 to 4 short sentences. NO markdown, bullets, headers, tables or "
    "emoji.\n- Conversational and sharp. Round numbers naturally ('about fifty-one hours', 'two "
    "point six million tonnes').\n- Answer ONLY from the DATA below (already scoped to this user). If "
    "it isn't there, say so in one sentence.\n- The recogniser may garble vessel or terminal names — "
    "infer the closest sensible meaning.\n- Sound natural Indian-English.")

_VOICE_GENDER_RULES = {("en", "female"): "\n\nSPEAKER: You are a female voice.",
                       ("en", "male"): "\n\nSPEAKER: You are a male voice."}


def _voice_pack(user):
    s = get_store()
    vis = s.visible(s.unit_latest, user)
    child = s.child_level(user)
    units = vis[vis.level == child]
    home = vis[vis.unit_id == s.home_unit_id(user)]
    hr = home.iloc[0].to_dict() if len(home) else {}
    waitiest = (units.dropna(subset=["avg_waiting_hr"]).nlargest(5, "avg_waiting_hr")
                [["unit_name", "avg_waiting_hr"]] if "avg_waiting_hr" in units.columns else units.head(0))
    busiest = (units.nlargest(5, "vessel_calls")[["unit_name", "vessel_calls", "cargo_mt"]]
               if "vessel_calls" in units.columns else units.head(0))
    sec = getattr(s, "sections", {}) or {}
    wl = s.frames.get("vessel_watchlist")
    pack = {"latest_month": s.latest_month,
            "your_unit": {"name": hr.get("unit_name"), "vessel_calls": hr.get("vessel_calls"),
                          "cargo_mt": hr.get("cargo_mt"), "teu": hr.get("teu"),
                          "avg_turnaround_hr": hr.get("avg_turnaround_hr"),
                          "avg_waiting_hr": hr.get("avg_waiting_hr"),
                          "occupancy_pct": hr.get("occupancy_pct"),
                          "incidents": hr.get("incidents_total"),
                          "outstanding_cr": hr.get("outstanding_cr")},
            "major_port_benchmark": s.benchmark,
            "longest_waiting_units": waitiest.to_dict("records"),
            "busiest_units": busiest.to_dict("records"),
            "hse": sec.get("incidents", {}).get("kpis", {}),
            "inspections": sec.get("inspections", {}).get("kpis", {}),
            "revenue": sec.get("revenue", {}).get("kpis", {}),
            "crew": sec.get("crew", {}).get("kpis", {}),
            "vessel_watchlist_top": (wl.head(5)[["vessel", "type", "incidents", "detentions", "watch_score"]]
                                     .to_dict("records") if wl is not None and len(wl) else []),
            "watchlist_note": "the 8 documented liner callers keep clean records and are excluded "
                              "from the watchlist by design",
            "key_findings": [f"{f['id']}: {f['title']}" for f in s.findings if f.get("severity") == "high"][:6]}
    return json.dumps(pack, ensure_ascii=False, default=str)


_VOICE_SQL_TOOL = (
    "\n\nDATABASE ACCESS: If (and only if) the DATA does not contain what was asked, reply with "
    "ONLY a fenced ```sql block holding ONE PostgreSQL SELECT (aggregate, LIMIT 10) — I will run "
    "it and return the result for your spoken answer. Schema summary:\n")


def voice_answer(msg, history, user, lang="en", gender="female"):
    from . import pg_query
    g = gender if gender in ("female", "male") else "female"
    system = (_VOICE_PERSONA + lang_rule(lang) + _VOICE_GENDER_RULES.get(("en", g), "") +
              _learned_rules() + _VOICE_SQL_TOOL + pg_query.SCHEMA_DOC +
              "\n\nDATA:\n" + _voice_pack(user))
    hist = _history_text(history[-6:] if history else [])
    user_prompt = (f"{hist}\n\nUser (spoken): {msg}" if hist else msg)
    if not claude_cli.available():
        return {"reply": "Voice assistant is offline right now.", "source": "error"}
    text = claude_cli.complete(user_prompt, system=system, model="haiku", timeout=90).strip()
    stmts = _extract_sql(text)
    if stmts:
        r = pg_query.run_select(stmts[0], max_rows=10)
        follow = (f"{user_prompt}\n\n[SQL RESULT]\n" + json.dumps(r, default=str)[:4000] +
                  "\n\nAnswer the spoken question now from this result — natural speech, no "
                  "markdown, no sql.")
        text = claude_cli.complete(follow, system=system, model="haiku", timeout=90).strip()
        return {"reply": text, "source": "claude_cli+sql"}
    return {"reply": text, "source": "claude_cli"}


# ---------------------------------------------------------------------------
# RAG "talk to the documents"
# ---------------------------------------------------------------------------
_DOCS_PERSONA = ("You are Sagar Drishti, the port operations analyst, in DOCUMENT mode: you "
                 "answer strictly from the port document library excerpts retrieved below (marine "
                 "circulars, PSC inspection procedures, HSE SOPs, tariff schedules, the concession "
                 "and berthing policies).")
_DOCS_RULES = ("Rules:\n- Answer ONLY from the numbered excerpts. If they don't contain the answer, say "
               "so and suggest which document might.\n- Cite every claim with the excerpt number(s) e.g. "
               "[1] or [2][4].\n- Keep answers tight and practical. Light markdown.")


def docs_answer(msg, history, lang="en"):
    hits = rag.search(msg, k=6)
    if not hits:
        return {"reply": "**Document search is not available yet.** The port knowledge index hasn't been "
                "built (marine circulars, HSE SOPs, tariff schedules, PSC procedures). Data questions "
                "still work in Live-data mode.", "source": "error", "rag_sources": []}
    excerpts = [f"[{i}] {h['title']} (p.{h['page']}) — {h['source']}\n{h['text'][:1400]}"
                for i, h in enumerate(hits, 1)]
    system = (_DOCS_PERSONA + "\n\n" + _DOCS_RULES + lang_rule(lang) + "\n\nEXCERPTS:\n\n" + "\n\n---\n\n".join(excerpts))
    hist = _history_text(history)
    user_prompt = (f"{hist}\n\nUser: {msg}" if hist else msg)
    sources = [{"n": i + 1, "title": h["title"], "page": h["page"], "category": h["category"],
                "source": h["source"], "url": h["url"], "score": h["score"]} for i, h in enumerate(hits)]
    if claude_cli.available():
        return {"reply": claude_cli.complete(user_prompt, system=system), "source": "claude_cli", "rag_sources": sources}
    best = hits[0]
    return {"reply": f"**Closest passage — {best['title']} (p.{best['page']}):**\n\n> {best['text'][:900]}",
            "source": "retrieval_only", "rag_sources": sources}


# ---------------------------------------------------------------------------
# "AI explain"
# ---------------------------------------------------------------------------
import hashlib
import os as _os
import threading as _threading
from typing import Any, Optional

_EXPLAIN_CACHE_PATH = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "agent_state", "explain_cache.json")
_EXPLAIN_LOCK = _threading.Lock()
try:
    _EXPLAIN_CACHE = json.load(open(_EXPLAIN_CACHE_PATH))
except Exception:
    _EXPLAIN_CACHE = {}
_EXPLAIN_VER = None


def _explain_fresh(s):
    """Invalidate cached chart explanations once the pipeline data is rebuilt."""
    global _EXPLAIN_VER, _EXPLAIN_CACHE
    v = getattr(s, "data_version", None)
    if v != _EXPLAIN_VER:
        _EXPLAIN_VER = v
        _EXPLAIN_CACHE = {}

_EXPLAIN_SYSTEM = (
    "You are Sagar Drishti, the port operations analyst (Maritime AI Analytics). "
    "Explain ONE specific chart/table/figure to someone with NO analytics background — a berth "
    "supervisor, duty officer, or terminal shift manager. Simple, warm, jargon-free English (define "
    "terms in brackets). Use this exact markdown structure:\n"
    "## What this shows\n(2-3 sentences)\n## How to read it\n(walk through it; cite 2-4 REAL numbers "
    "from the DATA)\n## What stands out\n(2-3 takeaways)\n## Why it matters\n(vessel service / safety "
    "/ revenue; honest caveats)\n## What you can do\n(2-3 practical bullets)\n\n"
    "Under ~350 words. Never mention AI engines or files. Ground every number in the DATA.")


class ExplainIn(BaseModel):
    title: str = ""
    caption: str = ""
    page: str = ""
    data: Optional[Any] = None
    lang: str = "en"


@router.post("/explain")
def explain(body: ExplainIn, user=Depends(current_user)):
    lng = body.lang if body.lang in ("hi", "gu") else "en"
    s = get_store()
    _explain_fresh(s)
    key = hashlib.sha1(json.dumps([body.title, body.caption, body.page, user.get("scope"),
                                   ([lng] if lng != "en" else [])], sort_keys=True).encode()).hexdigest()[:16]
    if key in _EXPLAIN_CACHE:
        return {"explanation": _EXPLAIN_CACHE[key], "cached": True}
    element = {"title": body.title, "caption": body.caption, "portal_page": body.page}
    if body.data is not None:
        element["element_data"] = body.data
    prompt = ("ELEMENT TO EXPLAIN:\n" + json.dumps(element, default=str)[:6000] +
              "\n\nDATA (live scoped portal data pack):\n" +
              json.dumps(s.context_pack(user), ensure_ascii=False, default=str)[:24000])
    if not claude_cli.available():
        raise HTTPException(503, "The Sagar Drishti engine is offline")
    text = claude_cli.complete(prompt, system=_EXPLAIN_SYSTEM + lang_rule(lng), model=config.AGENT_MODEL, timeout=240)
    with _EXPLAIN_LOCK:
        _EXPLAIN_CACHE[key] = text
        try:
            json.dump(_EXPLAIN_CACHE, open(_EXPLAIN_CACHE_PATH, "w"))
        except Exception:
            pass
    return {"explanation": text, "cached": False}


@router.get("/knowledge/status")
def knowledge_status(user=Depends(current_user)):
    return rag.status()


@router.get("/chat/status")
def chat_status(user=Depends(current_user)):
    return {"cli": claude_cli.available(), "api": bool(config.ANTHROPIC_API_KEY), "rag": rag.status()}


@router.post("/chat")
def chat(body: ChatIn, user=Depends(current_user)):
    msg = (body.message or "").strip()
    mode = body.mode if body.mode in ("report", "docs") else "concise"
    if not msg:
        return {"reply": "Ask me about vessel traffic, a terminal or berth, waiting times, incidents, "
                "receivables, or the findings.",
                "source": "builtin"}
    lang = body.lang if body.lang in ("hi", "gu") else "en"

    if body.mode == "voice":
        try:
            return voice_answer(msg, body.history or [], user, lang=lang, gender=body.voice_gender)
        except Exception:
            return {"reply": "Sorry, I couldn't answer that just now. Please ask again.", "source": "error"}

    if creative.is_creative_request(msg) and claude_cli.available():
        try:
            reply, asset = creative.make_asset(msg, grounding=_creative_grounding(user), lang=lang)
            if asset:
                return {"reply": reply, "source": "claude_cli", "asset": asset}
        except Exception:
            pass

    if mode == "docs":
        try:
            return docs_answer(msg, body.history or [], lang=lang)
        except Exception as e:
            return {"reply": f"**Document search hit an error** ({type(e).__name__}). Try Live-data mode.",
                    "source": "error", "rag_sources": []}

    if mode == "concise" and lang == "en":
        ans = builtin_answer(msg, user)
        if ans:
            return ans

    try:
        out = llm_answer(msg, body.history or [], mode, user, lang=lang)
        if out:
            return out
    except Exception as e:
        if mode == "report":
            return {"reply": "**Sagar Drishti is temporarily unavailable.** Please try again in a moment.",
                    "source": "error"}
        ans = builtin_answer(msg, user)
        if ans:
            return ans
        return {"reply": f"The assistant hit an error ({type(e).__name__}). I can still answer built-in "
                "questions: try **'longest waiting'**, **'outstanding receivables'**, **'vessel watchlist'**, "
                "or **'what are the findings'**.", "source": "error"}

    return {"reply": "I can answer built-in questions — try **'longest waiting terminals'**, **'outstanding "
            "receivables'**, **'vessel watchlist'**, **'overview'**, or **'what are the findings'**. The full "
            "Sagar Drishti assistant is currently offline.", "source": "nokey"}
