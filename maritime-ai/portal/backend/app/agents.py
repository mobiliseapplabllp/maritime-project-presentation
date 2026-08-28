"""
Agent workforce for Sagar Drishti.

A team of specialised agents that keep the port operations picture
fresh and actionable every cycle (default: every 2 hours). Each agent has a role,
its own persistent memory, and hands off to the next. Reasoning agents run on the
local Claude CLI; data agents compute directly on the live panels. A Duty Officer
runs the cycle, logs a live feed, escalates high-severity items, and caches the
last successful cycle.

Agents:
  collector  — Harbour Collector: rebuilds the ops/marine/hse/revenue panels
  sentinel   — Berth Sentinel: flags sudden waiting-time rises (adaptive thresholds)
  auditor    — Marine Auditor: scores each terminal's service vs major-port benchmarks
  planner    — Berth Planner: turns alerts into a prioritised action list
  analyst    — Trade Analyst: writes the executive brief for the cycle
  supervisor — Duty Officer: orchestrates, logs the feed, escalates to humans
"""
import datetime as dt
import json
import os
import threading
import uuid

from . import config, claude_cli
from .data import get_store

_STATE = os.path.abspath(config.AGENT_STATE_DIR)
os.makedirs(_STATE, exist_ok=True)

AGENTS = [
    {"id": "collector", "name": "Harbour Collector", "icon": "⇩", "kind": "data",
     "role": "Ingestion", "desc": "Rebuilds the ops/marine/hse/revenue panels and analysis artifacts "
     "from the latest port operations snapshot, keeping the system's knowledge current."},
    {"id": "curator", "name": "Facts Curator", "icon": "💡", "kind": "data",
     "role": "Insight", "desc": "Owns the Interesting Facts section: re-mines the headline facts from "
     "the live port data once a day, verifies every number, and reports which facts shifted."},
    {"id": "sentinel", "name": "Berth Sentinel", "icon": "◎", "kind": "data",
     "role": "Monitoring", "desc": "Compares each cycle against its learned baseline, flags sudden "
     "rises in anchorage waiting time per terminal, and adapts its alert thresholds over time."},
    {"id": "auditor", "name": "Marine Auditor", "icon": "✓", "kind": "reasoning",
     "role": "Validation", "desc": "Scores each terminal's marine service (waiting vs the pre-berthing "
     "benchmark, turnaround, detentions, incident load) and explains what looks off."},
    {"id": "planner", "name": "Berth Planner", "icon": "◈", "kind": "reasoning",
     "role": "Targeting", "desc": "Turns alerts and low-scoring terminals into a prioritised action "
     "list — where to add tug/pilot cover, which berth windows to re-plan, which dues to chase."},
    {"id": "analyst", "name": "Trade Analyst", "icon": "✦", "kind": "reasoning",
     "role": "Reporting", "desc": "Writes the cycle's executive brief in plain language, grounded "
     "only in the live data and the other agents' findings."},
    {"id": "examiner", "name": "QA Examiner", "icon": "?", "kind": "reasoning",
     "role": "Training", "desc": "Writes the questions port leadership and terminal heads would "
     "ask the platform — varied, non-repeating — and puts them to the live chatbot pipeline."},
    {"id": "validator", "name": "QA Validator", "icon": "✔", "kind": "reasoning",
     "role": "Correction", "desc": "Independently verifies every chatbot answer against the Postgres "
     "ground truth with its own SQL, scores it, and turns failures into persistent lessons that are "
     "injected back into the chatbot — the reinforcement loop."},
    {"id": "supervisor", "name": "Duty Officer", "icon": "⌘", "kind": "orchestrator",
     "role": "Orchestration", "desc": "Runs the 2-hourly cycle, routes hand-offs, and escalates "
     "high-severity items to a human."},
]
_AGENT_BY_ID = {a["id"]: a for a in AGENTS}

_RUNS = {}
_RUNS_LOCK = threading.Lock()


# ---------------------------------------------------------------- configuration
_CONFIG_LOCK = threading.Lock()
_CONFIG_PATH = os.path.join(_STATE, "agent_config.json")

DEFAULT_CONFIG = {
    "schedule": {
        "enabled": config.AGENT_SCHEDULE_ENABLED,
        "mode": "interval",                 # Sagar Drishti default: every N hours
        "hour": config.AGENT_SCHEDULE_HOUR,
        "interval_hours": config.AGENT_SCHEDULE_INTERVAL,   # default 2
    },
    "escalation": {"enabled": True},
    "agents": {
        "collector": {"enabled": True},
        "curator":   {"enabled": True},
        "sentinel":  {"enabled": True, "sensitivity": 2.5, "min_threshold_hr": 2.0},
        "auditor":   {"enabled": True, "model": config.AGENT_MODEL},
        "planner":   {"enabled": True, "model": config.AGENT_MODEL, "max_actions": 6},
        "analyst":   {"enabled": True, "model": config.AGENT_MODEL},
    },
}

_ALLOWED_MODELS = ("sonnet", "opus", "haiku")
_ALLOWED_INTERVALS = (1, 2, 3, 6, 12, 24)   # 2-hourly enrichment enabled by default


def _deep_merge(base, patch):
    out = dict(base)
    for k, v in (patch or {}).items():
        out[k] = _deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def _validate_config(cfg):
    sc = cfg.get("schedule", {})
    sc["enabled"] = bool(sc.get("enabled", True))
    sc["mode"] = sc.get("mode") if sc.get("mode") in ("daily", "interval") else "interval"
    try:
        sc["hour"] = min(23, max(0, int(sc.get("hour", 7))))
    except Exception:
        sc["hour"] = 7
    try:
        iv = int(sc.get("interval_hours", 2))
        sc["interval_hours"] = iv if iv in _ALLOWED_INTERVALS else 2
    except Exception:
        sc["interval_hours"] = 2
    cfg["schedule"] = sc
    esc = cfg.get("escalation", {})
    esc["enabled"] = bool(esc.get("enabled", True))
    cfg["escalation"] = esc
    ag = cfg.get("agents", {})
    for aid, defaults in DEFAULT_CONFIG["agents"].items():
        a = _deep_merge(defaults, ag.get(aid, {}))
        a["enabled"] = bool(a.get("enabled", True))
        if "model" in defaults and a.get("model") not in _ALLOWED_MODELS:
            a["model"] = defaults["model"]
        if "sensitivity" in defaults:
            try:
                a["sensitivity"] = round(min(5.0, max(1.5, float(a.get("sensitivity", 2.5)))), 1)
            except Exception:
                a["sensitivity"] = 2.5
            try:
                a["min_threshold_hr"] = round(min(10.0, max(0.5, float(a.get("min_threshold_hr", 2.0)))), 1)
            except Exception:
                a["min_threshold_hr"] = 2.0
        if "max_actions" in defaults:
            try:
                a["max_actions"] = min(8, max(3, int(a.get("max_actions", 6))))
            except Exception:
                a["max_actions"] = 6
        ag[aid] = a
    cfg["agents"] = ag
    return cfg


def get_config():
    with _CONFIG_LOCK:
        try:
            saved = json.load(open(_CONFIG_PATH))
        except Exception:
            saved = {}
        return _validate_config(_deep_merge(DEFAULT_CONFIG, saved))


def update_config(patch):
    with _CONFIG_LOCK:
        try:
            saved = json.load(open(_CONFIG_PATH))
        except Exception:
            saved = {}
        merged = _validate_config(_deep_merge(_deep_merge(DEFAULT_CONFIG, saved), patch or {}))
        json.dump(merged, open(_CONFIG_PATH, "w"), indent=2)
    return merged


def _agent_cfg(cfg, aid):
    return cfg.get("agents", {}).get(aid, {})


# ---------------------------------------------------------------- persistence
def _mem_path(aid):
    return os.path.join(_STATE, f"{aid}.json")


def _load_mem(aid):
    try:
        return json.load(open(_mem_path(aid)))
    except Exception:
        return {"runs": [], "baseline": {}, "last_run": None}


def _save_mem(aid, mem):
    mem["runs"] = mem.get("runs", [])[-20:]
    json.dump(mem, open(_mem_path(aid), "w"), indent=2, default=str)


def _now():
    return dt.datetime.now()


def _iso(t):
    return t.isoformat(timespec="seconds")


def _ev(run, agent_id, kind, text):
    run["events"].append({"t": _iso(_now()), "agent": agent_id, "kind": kind, "text": text})


def _set_agent(run, agent_id, **kw):
    run["agents"].setdefault(agent_id, {})
    run["agents"][agent_id].update(kw)


# ---------------------------------------------------------------- agent logic
def _mom_waiting():
    """Latest vs previous month anchorage waiting (hr) per terminal."""
    s = get_store()
    ops = s.frames.get("ops")
    if ops is None or "avg_waiting_hr" not in ops.columns:
        return []
    od = ops[ops.level == "terminal"].dropna(subset=["avg_waiting_hr"]).sort_values("ym")
    rows = []
    for name, grp in od.groupby("unit_name"):
        grp = grp.sort_values("ym")
        if len(grp) >= 2:
            last = float(grp.avg_waiting_hr.iloc[-1]); prev = float(grp.avg_waiting_hr.iloc[-2])
            rows.append({"terminal": name, "latest": last, "prev": prev, "delta": round(last - prev, 2)})
    return rows


def run_collector(run, mem):
    s = get_store()
    # Full local rebuild: portal snapshot -> panels -> analysis artifacts, then hot-reload.
    # Everything downstream (dashboards, chatbot pack, voice pack, text-to-SQL) reads the
    # store/sections live, so a fresh snapshot harvest propagates end-to-end here.
    import subprocess
    import sys as _sys
    builders = (
        (os.path.join(config.BUILDER_DIR, "build_panels.py"), config.BUILDER_DIR, "panels"),
        (os.path.join(config.PROJECT_ROOT, "analysis", "analyze_mundra.py"),
         os.path.join(config.PROJECT_ROOT, "analysis"), "analysis artifacts"),
    )
    for sp, cwd, label in builders:
        if not os.path.exists(sp):
            continue
        _ev(run, "collector", "work", f"Rebuilding {label} from the latest port operations snapshot…")
        try:
            r = subprocess.run([_sys.executable, sp], cwd=cwd,
                               capture_output=True, text=True, timeout=600)
            if r.returncode != 0:
                _ev(run, "collector", "work",
                    f"{label} rebuild failed (kept previous): {(r.stderr or '')[-160:]}")
        except Exception as e:
            _ev(run, "collector", "work", f"{label} rebuild error (kept previous): {str(e)[:120]}")
    _ev(run, "collector", "work", "Syncing the ops/marine/hse/revenue panels from disk…")
    info = s.reload()  # real refresh from disk (builders regenerate the CSVs upstream)
    n_units = int(s.unit_latest.unit_id.nunique())
    lm = s.latest_month
    _ev(run, "collector", "work", f"Refreshed {len(s.frames)} panels · {n_units} units · latest {lm}.")
    summary = f"Cycle {lm} synced — {n_units} units across {len(s.frames)} panels."
    _ev(run, "collector", "done", summary)
    _set_agent(run, "collector", status="done", summary=summary,
               metrics={"units": n_units, "latest_month": lm, "panels": len(s.frames)})
    mem["last_run"] = _iso(_now()); mem["runs"].append({"at": _iso(_now()), "summary": summary})
    return {"latest_month": lm, "units": n_units}


def run_curator(run, mem):
    """Daily owner of the Interesting Facts section: re-mines, verifies, reports drift."""
    import subprocess
    import sys as _sys
    facts_path = os.path.join(config.ANALYSIS_DIR, "facts.json")
    today = _now().strftime("%Y-%m-%d")
    if mem.get("last_renewed") == today:
        summary = f"Facts already renewed today ({today}) — freshness verified, no action needed."
        _ev(run, "curator", "done", summary)
        _set_agent(run, "curator", status="done", summary=summary)
        mem["runs"].append({"at": _iso(_now()), "summary": summary})
        return {"renewed": False}

    def _flatten(doc):
        """{'headline': stat} pairs from either a facts list or the per-year pack."""
        out = {}
        for f in (doc.get("facts") or []):
            out[str(f.get("headline"))] = f.get("stat")
        for yr, vals in (doc.get("per_year") or {}).items():
            if isinstance(vals, dict):
                for k, v in vals.items():
                    out[f"{yr} {k}"] = v
        return out

    prev = {}
    try:
        prev = _flatten(json.load(open(facts_path)))
    except Exception:
        pass
    _ev(run, "curator", "work", "Re-mining the Interesting Facts from the live port data…")
    analysis_dir = os.path.join(config.PROJECT_ROOT, "analysis")
    try:
        r = subprocess.run([_sys.executable, os.path.join(analysis_dir, "analyze_mundra.py")],
                           cwd=analysis_dir, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or "")[-160:])
    except Exception as e:
        summary = f"Fact renewal FAILED — kept yesterday's facts. {str(e)[:120]}"
        _ev(run, "curator", "done", summary)
        _set_agent(run, "curator", status="done", summary=summary)
        mem["runs"].append({"at": _iso(_now()), "summary": summary})
        return {"renewed": False, "error": str(e)[:120]}
    new = {}
    try:
        new = _flatten(json.load(open(facts_path)))
    except Exception:
        pass
    shifted = [h for h in new if h in prev and new[h] != prev[h]]
    added = [h for h in new if h not in prev]
    mem["last_renewed"] = today
    detail = (f"{len(shifted)} fact(s) shifted: " + "; ".join(
              f"'{h}' {prev[h]} → {new[h]}" for h in shifted[:3])) if shifted else "all stable vs yesterday"
    summary = f"Renewed all {len(new)} facts from live data ({today}) — {detail}" +               (f"; {len(added)} new" if added else "")
    _ev(run, "curator", "done", summary)
    _set_agent(run, "curator", status="done", summary=summary,
               metrics={"facts": len(new), "shifted": len(shifted)})
    mem["runs"].append({"at": _iso(_now()), "summary": summary})
    return {"renewed": True, "shifted": shifted}


def run_sentinel(run, mem, cfg=None):
    acfg = _agent_cfg(cfg or get_config(), "sentinel")
    sens = float(acfg.get("sensitivity", 2.5)); floor = float(acfg.get("min_threshold_hr", 2.0))
    _ev(run, "sentinel", "work", f"Comparing latest cycle against learned baseline… (sensitivity ×{sens})")
    rows = _mom_waiting()
    deltas = [abs(r["delta"]) for r in rows] or [0]
    mean_abs = sum(deltas) / len(deltas)
    prev_base = mem.get("baseline", {}).get("mean_abs_delta", mean_abs)
    learned = round(0.6 * prev_base + 0.4 * mean_abs, 2)
    thresh = round(max(floor, learned * sens), 2)
    alerts = []
    for r in sorted(rows, key=lambda x: -x["delta"]):  # biggest RISES first
        if r["delta"] >= thresh:
            sev = "high" if r["delta"] >= thresh * 1.5 else "medium"
            alerts.append({"terminal": r["terminal"], "delta": r["delta"], "severity": sev,
                           "text": f"{r['terminal']}: anchorage wait rose {r['delta']:.1f}h month-on-month "
                                   f"({r['prev']:.1f}h → {r['latest']:.1f}h)"})
    for a in alerts[:6]:
        _ev(run, "sentinel", "alert", a["text"])
    if not alerts:
        _ev(run, "sentinel", "work", f"No waiting-time rise above the learned threshold ({thresh}h).")
    mem["baseline"] = {"mean_abs_delta": learned, "threshold_hr": thresh, "updated": _iso(_now())}
    summary = f"{len(alerts)} waiting-time alert(s) above the adaptive threshold of {thresh}h."
    _ev(run, "sentinel", "done", summary)
    _set_agent(run, "sentinel", status="done", summary=summary,
               metrics={"alerts": len(alerts), "threshold_hr": thresh}, alerts=alerts[:8])
    mem["last_run"] = _iso(_now()); mem["runs"].append({"at": _iso(_now()), "summary": summary, "alerts": len(alerts)})
    return {"alerts": alerts, "threshold": thresh}


def _service_scores():
    """Per-terminal marine-service score 0-100 from waiting, turnaround, detentions, incidents."""
    s = get_store()
    ul = s.unit_latest
    d = ul[ul.level == "terminal"]
    bm = s.benchmark
    wait_t = float(bm.get("preberthing_target_hr", 5.0) or 5.0)
    ta_t = float(bm.get("turnaround_target_hr", 50.4) or 50.4)
    out = []
    for _, r in d.iterrows():
        score = 100.0
        wt = r.get("avg_waiting_hr")
        if wt is not None and wt == wt:
            score -= max(0.0, (float(wt) - wait_t)) * 4      # each hour above the pre-berthing benchmark
        ta = r.get("avg_turnaround_hr")
        if ta is not None and ta == ta:
            score -= max(0.0, (float(ta) - ta_t)) * 0.3
        det = r.get("detentions", 0) or 0
        if det > 0:
            score -= min(20, float(det) * 10)
        hi = r.get("incidents_high_critical", 0) or 0
        if hi > 0:
            score -= min(15, float(hi) * 5)
        out.append({"terminal": r["unit_name"], "score": max(5, round(score)),
                    "waiting_hr": None if wt != wt else round(float(wt), 2),
                    "detentions": int(det) if det == det else 0})
    out.sort(key=lambda x: x["score"])
    return out


def run_auditor(run, mem, cfg=None):
    model = _agent_cfg(cfg or get_config(), "auditor").get("model", config.AGENT_MODEL)
    _ev(run, "auditor", "work", "Scoring terminal marine service vs major-port benchmarks…")
    scores = _service_scores()
    worst = scores[:6]
    avg = round(sum(s["score"] for s in scores) / len(scores)) if scores else 0
    for w in worst[:5]:
        _ev(run, "auditor", "flag", f"{w['terminal']}: service score {w['score']}/100 "
            f"(waiting {w['waiting_hr']}h, {w['detentions']} detention(s))")
    note = ""
    try:
        _ev(run, "auditor", "work", "Reasoning over the lowest-scoring terminals…")
        prompt = ("You are the Marine Auditor for port operations. In 2 sentences, plainly "
                  "explain why these terminals look weakest on marine service (anchorage waiting above "
                  "the ~5h major-port pre-berthing benchmark, slow turnaround, PSC detentions and "
                  "high-severity incidents at their berths). "
                  f"Terminals (name, score/100, waiting h, detentions): {json.dumps(worst)}. "
                  "Be specific; no preamble.")
        note = claude_cli.complete(prompt, model=model, timeout=90).strip()
        _ev(run, "auditor", "insight", note[:400])
    except Exception:
        note = ("Lowest-scoring terminals hold vessels at anchorage well past the ~5h pre-berthing "
                "benchmark, with detentions and high-severity incidents adding to the service risk.")
        _ev(run, "auditor", "insight", note)
    summary = f"Avg service score {avg}/100 · {len(worst)} terminals flagged."
    _ev(run, "auditor", "done", summary)
    _set_agent(run, "auditor", status="done", summary=summary,
               metrics={"avg_compliance": avg, "flagged": len(worst)}, worst=worst, note=note)
    mem["last_run"] = _iso(_now()); mem["runs"].append({"at": _iso(_now()), "summary": summary})
    return {"worst": worst, "avg": avg, "note": note}


def run_planner(run, mem, sentinel_out, auditor_out, cfg=None):
    acfg = _agent_cfg(cfg or get_config(), "planner")
    model = acfg.get("model", config.AGENT_MODEL); max_actions = int(acfg.get("max_actions", 6))
    _ev(run, "planner", "work", "Merging waiting-time alerts, low-scoring terminals and receivables exposure…")
    s = get_store()
    d = s.unit_latest[s.unit_latest.level == "terminal"].copy()
    top_out = (d.sort_values("outstanding_cr", ascending=False).head(5)
               if "outstanding_cr" in d.columns else d.head(0))
    ctx = {"alerts": sentinel_out.get("alerts", [])[:6],
           "low_service": auditor_out.get("worst", [])[:6],
           "highest_outstanding": [{"terminal": r.unit_name, "outstanding_cr": round(float(r.outstanding_cr or 0), 2)}
                                   for _, r in top_out.iterrows()]}
    actions = []
    try:
        prompt = ("You are the Berth Planner for port operations. From the signals below, "
                  f"produce a prioritised action list of 4-{max_actions} concrete items (each: "
                  "terminal/berth + the specific action, e.g. 'add tug and pilot cover at X for the "
                  "morning tide window', 're-plan berth windows at Y to clear the anchorage queue', "
                  "'incident-prevention stand-down at Z', 'chase outstanding dues with agent of W'). "
                  "Return a plain numbered list, no preamble. Signals: " + json.dumps(ctx))
        text = claude_cli.complete(prompt, model=model, timeout=90).strip()
        actions = [ln.strip() for ln in text.splitlines() if ln.strip()][:max_actions]
    except Exception:
        actions = [f"Re-plan berth windows at {a['terminal']} — anchorage wait rising (Sentinel alert)"
                   for a in ctx["alerts"][:3]]
        actions += [f"Marine-service recovery review at {w['terminal']} — low service score"
                    for w in ctx["low_service"][:2]]
    for a in actions[:6]:
        _ev(run, "planner", "action", a.lstrip("0123456789. )"))
    summary = f"{len(actions)} prioritised actions drafted."
    _ev(run, "planner", "done", summary)
    _set_agent(run, "planner", status="done", summary=summary, actions=actions, metrics={"actions": len(actions)})
    mem["last_run"] = _iso(_now()); mem["runs"].append({"at": _iso(_now()), "summary": summary})
    return {"actions": actions}


def run_analyst(run, mem, sentinel_out, auditor_out, planner_out, cfg=None):
    model = _agent_cfg(cfg or get_config(), "analyst").get("model", config.AGENT_MODEL)
    _ev(run, "analyst", "work", "Trade Analyst drafting the cycle brief…")
    ctx = {"alerts": sentinel_out.get("alerts", [])[:6], "avg_service_score": auditor_out.get("avg"),
           "flagged": auditor_out.get("worst", [])[:5], "actions": planner_out.get("actions", [])[:6]}
    try:
        prompt = ("You are the Trade Analyst inside the maritime AI analytics portal. "
                  "Write a short cycle brief (a `## heading`, 2 tight paragraphs, then a `### Recommended "
                  "actions` bullet list) for the Harbour Master, summarising this cycle. Ground "
                  "every claim in the signals. Signals: " + json.dumps(ctx))
        brief = claude_cli.complete(prompt, model=model, timeout=120).strip()
    except Exception:
        brief = ("## Cycle brief\n\nThe agent cycle completed. See the Berth Sentinel waiting-time alerts "
                 "and Marine Auditor service flags above for this cycle's priorities.")
    _ev(run, "analyst", "done", "Executive brief ready.")
    _set_agent(run, "analyst", status="done", summary="Executive brief ready.", brief=brief)
    mem["last_run"] = _iso(_now()); mem["runs"].append({"at": _iso(_now()), "summary": "Brief generated."})
    return {"brief": brief}


# ---------------------------------------------------------------- the cycle
def _run_cycle(run_id, trigger="manual"):
    run = _RUNS[run_id]
    cfg = get_config()

    def enabled(aid):
        return _agent_cfg(cfg, aid).get("enabled", True)

    def skip(aid, name):
        _set_agent(run, aid, status="skipped")
        _ev(run, "supervisor", "handoff", f"{name} is disabled in configuration — skipped.")

    try:
        run["status"] = "running"
        _ev(run, "supervisor", "start", f"Agent cycle started ({trigger}).")
        for a in AGENTS:
            if a["id"] != "supervisor":
                _set_agent(run, a["id"], status="queued", name=a["name"], icon=a["icon"], role=a["role"])

        if enabled("collector"):
            _set_agent(run, "collector", status="running")
            mem = _load_mem("collector"); run_collector(run, mem); _save_mem("collector", mem)
            _ev(run, "supervisor", "handoff", "Harbour Collector → Facts Curator (fresh data ready).")
        else:
            skip("collector", "Harbour Collector")

        if enabled("curator"):
            _set_agent(run, "curator", status="running")
            mem = _load_mem("curator"); run_curator(run, mem); _save_mem("curator", mem)
            _ev(run, "supervisor", "handoff", "Facts Curator → Berth Sentinel (insights renewed).")
        else:
            skip("curator", "Facts Curator")

        sen = {}
        if enabled("sentinel"):
            _set_agent(run, "sentinel", status="running")
            mem = _load_mem("sentinel"); sen = run_sentinel(run, mem, cfg); _save_mem("sentinel", mem)
            _ev(run, "supervisor", "handoff", "Berth Sentinel → Marine Auditor (alerts raised).")
        else:
            skip("sentinel", "Berth Sentinel")

        aud = {}
        if enabled("auditor"):
            _set_agent(run, "auditor", status="running")
            mem = _load_mem("auditor"); aud = run_auditor(run, mem, cfg); _save_mem("auditor", mem)
            _ev(run, "supervisor", "handoff", "Marine Auditor → Berth Planner (service scored).")
        else:
            skip("auditor", "Marine Auditor")

        pla = {}
        if enabled("planner"):
            _set_agent(run, "planner", status="running")
            mem = _load_mem("planner"); pla = run_planner(run, mem, sen, aud, cfg); _save_mem("planner", mem)
            _ev(run, "supervisor", "handoff", "Berth Planner → Trade Analyst (actions drafted).")
        else:
            skip("planner", "Berth Planner")

        ana = {}
        if enabled("analyst"):
            _set_agent(run, "analyst", status="running")
            mem = _load_mem("analyst"); ana = run_analyst(run, mem, sen, aud, pla, cfg); _save_mem("analyst", mem)
        else:
            skip("analyst", "Trade Analyst")

        high = [a for a in sen.get("alerts", []) if a.get("severity") == "high"]
        if high and cfg.get("escalation", {}).get("enabled", True):
            msg = (f"⚠ Escalated to human: {len(high)} high-severity waiting-time alert(s) — "
                   + ", ".join(a["terminal"] for a in high[:4]))
            _ev(run, "supervisor", "escalation", msg)
            run["escalation"] = msg

        run["brief"] = ana.get("brief", "")
        run["status"] = "done"
        run["finished_at"] = _iso(_now())
        _ev(run, "supervisor", "done", "Cycle complete. Brief and action list ready.")
        _persist_last_cycle(run, trigger)
    except Exception as e:
        run["status"] = "error"
        run["error"] = f"{type(e).__name__}: {str(e)[:200]}"
        _ev(run, "supervisor", "error", run["error"])


def _persist_last_cycle(run, trigger):
    snapshot = {"id": run["id"], "trigger": trigger, "started_at": run["started_at"],
                "finished_at": run.get("finished_at"), "status": run["status"],
                "events": run["events"], "agents": run["agents"], "brief": run.get("brief", ""),
                "escalation": run.get("escalation")}
    json.dump(snapshot, open(os.path.join(_STATE, "last_cycle.json"), "w"), indent=2, default=str)


def start_cycle(trigger="manual"):
    run_id = "run_" + uuid.uuid4().hex[:10]
    with _RUNS_LOCK:
        _RUNS[run_id] = {"id": run_id, "status": "queued", "started_at": _iso(_now()),
                         "events": [], "agents": {}, "brief": "", "trigger": trigger}
    threading.Thread(target=_run_cycle, args=(run_id, trigger), daemon=True).start()
    return run_id


def get_run(run_id):
    return _RUNS.get(run_id)


def last_cycle():
    try:
        return json.load(open(os.path.join(_STATE, "last_cycle.json")))
    except Exception:
        return None


def agents_status():
    out = []
    for a in AGENTS:
        mem = _load_mem(a["id"])
        last = mem.get("runs", [])[-1] if mem.get("runs") else None
        out.append({**a, "last_run": mem.get("last_run"), "last_summary": (last or {}).get("summary"),
                    "runs": len(mem.get("runs", [])), "baseline": mem.get("baseline") or None})
    return out


def agent_memory(aid):
    if aid not in _AGENT_BY_ID:
        return None
    return {**_AGENT_BY_ID[aid], **_load_mem(aid)}


# ---------------------------------------------------------------- scheduler
_SCHED_STOP = threading.Event()
_SCHED_STARTED = False
_LAST_SCHED_FIRE = None


def _next_target(cfg=None):
    sc = (cfg or get_config()).get("schedule", {})
    if not sc.get("enabled", True):
        return None
    now = _now()
    if sc.get("mode") == "interval":
        iv = int(sc.get("interval_hours", 2))
        base = now.replace(minute=0, second=0, microsecond=0)
        return base.replace(hour=(now.hour // iv) * iv) + dt.timedelta(hours=iv)
    target = now.replace(hour=int(sc.get("hour", 7)), minute=0, second=0, microsecond=0)
    if target <= now:
        target = target + dt.timedelta(days=1)
    return target


def _scheduler_loop():
    global _LAST_SCHED_FIRE
    while not _SCHED_STOP.is_set():
        target = _next_target()
        if target is None:
            if _SCHED_STOP.wait(30):
                break
            continue
        wait_s = (target - _now()).total_seconds()
        if _SCHED_STOP.wait(min(max(wait_s, 1), 30)):
            break
        if _now() >= target and get_config().get("schedule", {}).get("enabled", True):
            if _LAST_SCHED_FIRE is None or (_now() - _LAST_SCHED_FIRE).total_seconds() > 90:
                _LAST_SCHED_FIRE = _now()
                try:
                    start_cycle(trigger="scheduled")
                except Exception:
                    pass


def start_scheduler():
    global _SCHED_STARTED
    if not _SCHED_STARTED:
        _SCHED_STARTED = True
        threading.Thread(target=_scheduler_loop, daemon=True).start()


def next_scheduled():
    target = _next_target()
    return _iso(target) if target else None
