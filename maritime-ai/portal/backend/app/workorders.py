"""
Work-order management — turn AI observations into tracked, SLA-bound actions.

Every work order records its full provenance: WHO identified it (AI finding /
agent cycle / a human), WHAT observation it came from, the SUGGESTED ACTIONS,
the RESPONSIBLE role, an SLA with due date, and a status timeline.

Storage: agent_state/workorders.json (thread-safe, demo-friendly).
"""
import json
import os
import re
import threading
from datetime import datetime, timedelta

from . import claude_cli, config

STORE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "agent_state", "workorders.json")
_LOCK = threading.Lock()

# responsive SLAs for live port operations
SLA_DAYS = {"high": 3, "medium": 7, "low": 15}
STATUSES = ["open", "in_progress", "completed"]
CATEGORIES = ["berth_operations", "marine_services", "hse_action", "revenue_recovery", "compliance"]

ZONES = ["Container", "Dry Bulk & General", "Liquid & Offshore"]
# terminal unit_ids and display names (the contract hierarchy)
TERMINALS = ["CT1", "CT2", "CT3", "CT4", "CT5", "WBC", "MPT", "RRT", "LQB", "SPM"]
TERMINAL_NAMES = {
    "CT1": "Container Terminal 1", "CT2": "Container Terminal 2",
    "CT5": "Container Terminal 5", "CT3": "Container Terminal 3", "CT4": "Container Terminal 4",
    "WBC": "West Basin Coal Terminal", "MPT": "Multipurpose Terminal",
    "RRT": "Ro-Ro Terminal", "LQB": "Liquid Terminal", "SPM": "SPM Crude",
}


def roles_directory():
    roles = [
        # Port administration
        {"id": "harbour_master", "label": "Harbour Master — Capt. Rajiv Nair (Port)", "scope": "port"},
        {"id": "dy_conservator", "label": "Dy. Conservator — Cdr. Suresh Patel (Marine & Surveys)",
         "scope": "port"},
        {"id": "marine_supdt", "label": "Marine Superintendent (Port)", "scope": "port"},
        {"id": "hse_manager", "label": "HSE Manager — Dr. Kavita Raval (Port)", "scope": "port"},
        {"id": "finance_controller", "label": "Finance Controller — Meenakshi Iyer (Port)", "scope": "port"},
        {"id": "crewing_manager", "label": "Crewing Manager (Port)", "scope": "port"},
    ]
    zone_people = {"Container": " (Devika Anand)"}
    for z in ZONES:
        roles.append({"id": f"zone_head:{z}", "label": f"Zone Head — {z}{zone_people.get(z, '')}",
                      "scope": "zone", "zone": z})
    tm_people = {"CT-1": " (Nirav Adhia)"}
    for t in TERMINALS:
        roles.append({"id": f"terminal_manager:{t}",
                      "label": f"Terminal Manager — {TERMINAL_NAMES.get(t, t)}{tm_people.get(t, '')}",
                      "scope": "terminal", "terminal": t})
        roles.append({"id": f"berth_supervisor:{t}",
                      "label": f"Berth Supervisor — {TERMINAL_NAMES.get(t, t)}",
                      "scope": "terminal", "terminal": t})
    return roles


def _load():
    try:
        return json.load(open(STORE_PATH))
    except Exception:
        return {"seq": 0, "orders": []}


def _save(db):
    os.makedirs(os.path.dirname(STORE_PATH), exist_ok=True)
    json.dump(db, open(STORE_PATH, "w"), indent=1, default=str)


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _with_computed(o):
    out = dict(o)
    if o["status"] != "completed":
        try:
            due = datetime.strptime(o["due_date"], "%Y-%m-%d")
            days_left = (due - datetime.now()).days
            out["days_left"] = days_left
            out["overdue"] = days_left < 0
        except Exception:
            out["days_left"], out["overdue"] = None, False
    else:
        out["days_left"], out["overdue"] = None, False
    return out


def list_orders(terminal=None, status=None, source_type=None):
    with _LOCK:
        db = _load()
    orders = [_with_computed(o) for o in db["orders"]]
    if terminal:
        orders = [o for o in orders if o.get("terminal") == terminal]
    if status:
        orders = [o for o in orders if (o["status"] == status) or (status == "overdue" and o["overdue"])]
    if source_type:
        orders = [o for o in orders if o["source"]["type"] == source_type]
    orders.sort(key=lambda o: (o["status"] == "completed", not o["overdue"], o["due_date"]))
    stats = {
        "total": len(db["orders"]),
        "open": sum(1 for o in db["orders"] if o["status"] == "open"),
        "in_progress": sum(1 for o in db["orders"] if o["status"] == "in_progress"),
        "completed": sum(1 for o in db["orders"] if o["status"] == "completed"),
        "overdue": sum(1 for o in orders if o["overdue"]),
        "ai_created": sum(1 for o in db["orders"] if o["source"]["type"] in ("finding", "agent")),
    }
    return {"orders": orders, "stats": stats}


def create(payload, created_by="user"):
    with _LOCK:
        db = _load()
        db["seq"] += 1
        wid = f"WO-{db['seq']:04d}"
        prio = payload.get("priority", "medium").lower()
        if prio not in SLA_DAYS:
            prio = "medium"
        sla = int(payload.get("sla_days") or SLA_DAYS[prio])
        terminal = payload.get("terminal") or payload.get("unit") or None
        order = {
            "id": wid,
            "title": (payload.get("title") or "Untitled action")[:160],
            "description": payload.get("description", ""),
            "terminal": terminal,
            "category": payload.get("category", "berth_operations"),
            "priority": prio,
            "sla_days": sla,
            "due_date": (datetime.now() + timedelta(days=sla)).strftime("%Y-%m-%d"),
            "assignee": payload.get("assignee") or {"id": "harbour_master",
                                                    "label": "Harbour Master — Capt. Rajiv Nair (Port)"},
            "status": "open",
            "source": payload.get("source") or {"type": "manual", "ref_id": None,
                                                "ref_title": None, "observed_at": None},
            "suggested_actions": payload.get("suggested_actions") or [],
            "created_at": _now(),
            "created_by": created_by,
            "updates": [{"at": _now(), "by": created_by, "status": "open",
                         "note": "Work order created" +
                                 (" from AI observation" if (payload.get("source") or {}).get("type") in ("finding", "agent") else "")}],
        }
        db["orders"].append(order)
        _save(db)
    return _with_computed(order)


def update(wid, patch, by="user"):
    with _LOCK:
        db = _load()
        for o in db["orders"]:
            if o["id"] == wid:
                note = patch.get("note", "")
                if patch.get("status") in STATUSES and patch["status"] != o["status"]:
                    o["status"] = patch["status"]
                    note = note or f"Status → {patch['status'].replace('_', ' ')}"
                if patch.get("assignee"):
                    o["assignee"] = patch["assignee"]
                    note = note or f"Reassigned to {patch['assignee'].get('label')}"
                if note:
                    o["updates"].append({"at": _now(), "by": by, "status": o["status"], "note": note})
                _save(db)
                return _with_computed(o)
    return None


# --------------------------------------------------------------------------
# AI drafting — an observation in, a complete work order out
# --------------------------------------------------------------------------
_DRAFT_SYSTEM = (
    "You are Sagar Drishti, the port operations analyst (Maritime AI Analytics). Convert ONE AI observation into ONE actionable work order. Observations arise from "
    "findings like berth congestion and anchorage queues, incident clusters, PSC detentions, or "
    "receivables slippage. Return ONLY a JSON object with keys: title (max 90 chars, imperative, "
    "starts with a verb), description (3-5 sentences: what was observed, why it matters for vessel "
    "service/safety/revenue, what the work order must achieve), terminal (one terminal code of "
    "CT-1|CT-2|CT-5|CT3|CT4|WBC|MPT|RRT|LQB|SPM, or null if port-wide), priority (high|medium|low), "
    "category (berth_operations|marine_services|hse_action|revenue_recovery|compliance), "
    "assignee_role (harbour_master|dy_conservator|marine_supdt|hse_manager|finance_controller|"
    "crewing_manager|zone_head:<Zone>|terminal_manager:<TERMINAL>|berth_supervisor:<TERMINAL> — pick "
    "the most appropriate level), suggested_actions (array of 3-5 short concrete steps). No text "
    "outside the JSON.")


def _draft_with_ai(observation_text):
    text = claude_cli.complete(observation_text, system=_DRAFT_SYSTEM, model=config.AGENT_MODEL, timeout=120)
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0)) if m else None


def _assignee_from_role(role_id):
    for r in roles_directory():
        if r["id"] == role_id:
            return {"id": r["id"], "label": r["label"]}
    return {"id": "harbour_master", "label": "Harbour Master — Capt. Rajiv Nair (Port)"}


def _category_of(text):
    t = (text or "").lower()
    if any(w in t for w in ("incident", "spill", "injur", "safety", "hse", "near miss", "near-miss",
                            "security", "fire")):
        return "hse_action"
    if any(w in t for w in ("outstanding", "receivab", "collect", "invoice", "billing", "dues")):
        return "revenue_recovery"
    if any(w in t for w in ("pilot", "tug", "dredg", "mooring", "survey", "garbage", "water suppl",
                            "bunker")):
        return "marine_services"
    if any(w in t for w in ("berth", "congest", "waiting", "turnaround", "window", "anchorage",
                            "occupanc", "queue")):
        return "berth_operations"
    return "compliance"


def _terminal_in(text):
    """Find a terminal reference (code or display name) inside free text."""
    up = (text or "").upper()
    for t in TERMINALS:
        if TERMINAL_NAMES.get(t, "").upper() in up:
            return t
        if re.search(r"\b" + re.escape(t) + r"\b", up):
            return t
    return None


def create_from_finding(finding, created_by="user"):
    obs = (f"OBSERVATION (automated finding {finding.get('id')}, severity {finding.get('severity')}, "
           f"area {finding.get('area')}):\n{finding.get('title')}\n\n{finding.get('inference', '')}\n\n"
           f"Evidence: {json.dumps(finding.get('evidence', {}), default=str)[:1500]}")
    draft = None
    if claude_cli.available():
        try:
            draft = _draft_with_ai(obs)
        except Exception:
            draft = None
    if not draft:
        draft = {"title": f"Act on: {finding.get('title', '')[:70]}",
                 "description": finding.get("inference", ""), "terminal": None,
                 "priority": finding.get("severity", "medium"),
                 "category": _category_of(finding.get("title", "") + " " + finding.get("area", "")),
                 "assignee_role": "harbour_master",
                 "suggested_actions": ["Verify the observation against the portal operations data",
                                       "Identify the affected terminals/berths and vessel calls",
                                       "Assign the corrective action and re-check next cycle"]}
    prio = draft.get("priority", finding.get("severity", "medium"))
    return create({
        "title": draft["title"], "description": draft.get("description", ""),
        "terminal": draft.get("terminal"),
        "category": draft.get("category", "compliance"), "priority": prio,
        "assignee": _assignee_from_role(draft.get("assignee_role", "harbour_master")),
        "suggested_actions": draft.get("suggested_actions", []),
        "source": {"type": "finding", "ref_id": finding.get("id"), "ref_title": finding.get("title"),
                   "observed_at": finding.get("observed_at") or "analysis engine (latest run)",
                   "identified_by": "AI — Sagar Drishti analysis engine"},
    }, created_by=created_by)


def generate_from_ai(created_by="user", max_orders=8):
    """Bulk: draft work orders from high-severity findings + the latest cycle's planner action list."""
    from .data import get_store
    from . import agents as agent_mod

    with _LOCK:
        existing = {(o["source"].get("type"), o["source"].get("ref_id")) for o in _load()["orders"]}

    created = []
    s = get_store()
    for f in [f for f in s.findings if f.get("severity") == "high"]:
        if len(created) >= max_orders:
            break
        if ("finding", f.get("id")) in existing:
            continue
        created.append(create_from_finding(f, created_by=created_by))

    try:
        cyc = agent_mod.last_cycle() or {}
        actions = (cyc.get("agents", {}).get("planner", {}) or {}).get("actions", [])
        finished = cyc.get("finished_at", "")
        for i, act in enumerate(actions):
            if len(created) >= max_orders:
                break
            ref = f"planner:{finished}:{i}"
            if ("agent", ref) in existing:
                continue
            clean = re.sub(r"^\s*\d+[.)]\s*", "", act).strip()
            terminal = _terminal_in(clean)
            prio = "high" if i < 2 else "medium"
            created.append(create({
                "title": clean[:90], "description": clean, "terminal": terminal,
                "category": _category_of(clean), "priority": prio,
                "assignee": _assignee_from_role(f"terminal_manager:{terminal}" if terminal else "harbour_master"),
                "suggested_actions": [],
                "source": {"type": "agent", "ref_id": ref,
                           "ref_title": f"Berth Planner action #{i+1}", "observed_at": finished,
                           "identified_by": "AI — Berth Planner agent"},
            }, created_by=created_by))
    except Exception:
        pass
    return created
