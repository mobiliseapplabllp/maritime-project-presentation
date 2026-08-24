"""Year Gone By — the annual wrapped/review pack per year (2023 / 2024 / 2025…).

GET /api/yearbook/{year} returns the year's statistics computed live from the
Mundra panels (ops / marine / hse / revenue) and the portal demo snapshot's
record collections (port calls, incidents), plus AI scene captions (generated
once per year, cached; default template captions until then, with generation
kicked off in the background).
"""
import datetime as dt
import json
import os
import threading

from fastapi import APIRouter, Depends, HTTPException

from . import claude_cli, config
from .auth import current_user
from .data import get_store

router = APIRouter(prefix="/api/yearbook", dependencies=[Depends(current_user)])

_STATE = os.path.abspath(config.AGENT_STATE_DIR)
_lock = threading.Lock()
_generating = set()

_SNAPSHOT_PATH = os.environ.get(
    "SAGAR_SNAPSHOT",
    os.path.abspath(os.path.join(config.PROJECT_ROOT, "..", "portal", "frontend",
                                 "src", "demo", "snapshot.json")))
_snap_cache = {"loaded": False, "collections": {}}


def _collections():
    if not _snap_cache["loaded"]:
        try:
            _snap_cache["collections"] = json.load(open(_SNAPSHOT_PATH)).get("collections", {})
        except Exception:
            _snap_cache["collections"] = {}
        _snap_cache["loaded"] = True
    return _snap_cache["collections"]


def _pf(s, panel, level, year):
    """Panel rows for one level and calendar year (empty frame if absent)."""
    df = s.frames.get(panel)
    if df is None or not len(df):
        return None
    d = df[(df.level == level) & (df.ym.astype(str).str.startswith(str(year)))]
    return d if len(d) else None


def _n(v, nd=1):
    try:
        import math
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, nd)
    except Exception:
        return None


def _stats(year: int):
    s = get_store()
    y = str(year)

    ops = _pf(s, "ops", "port", year)
    traffic = {}
    busiest = {}
    if ops is not None:
        traffic = {
            "calls": int(ops.vessel_calls.sum()),
            "cargo_mmt": _n(ops.cargo_mt.sum() / 1e6, 2),
            "teu": int(ops.teu.sum()),
            "avg_turnaround_hr": _n(ops.avg_turnaround_hr.mean()),
            "avg_waiting_hr": _n(ops.avg_waiting_hr.mean()),
            "berthed_lt6h_pct": _n(ops.berthed_lt6h_pct.mean()),
        }
        b = ops.sort_values("cargo_mt", ascending=False).iloc[0]
        busiest = {"ym": str(b.ym), "cargo_mt": int(b.cargo_mt), "calls": int(b.vessel_calls)}

    hse = _pf(s, "hse", "port", year)
    incidents, inc_worst = {}, {}
    if hse is not None:
        incidents = {
            "incidents": int(hse.incidents_total.sum()),
            "high_critical": int(hse.incidents_high_critical.sum()),
            "injuries": int(hse.injuries.sum()),
            "spills": int(hse.spills.sum()),
            "near_miss": int(hse.near_miss.sum()),
        }
        w = hse.sort_values("incidents_total", ascending=False).iloc[0]
        inc_worst = {"ym": str(w.ym), "incidents": int(w.incidents_total)}

    mar = _pf(s, "marine", "port", year)
    inspections, services = {}, {}
    if mar is not None:
        inspections = {
            "done": int(mar.inspections_done.sum()),
            "findings": int(mar.findings_raised.sum()),
            "findings_closed": int(mar.findings_closed.sum()),
            "detentions": int(mar.detentions.sum()),
        }
        services = {
            "pilotage_moves": int(mar.pilotage_moves.sum()),
            "tug_jobs": int(mar.tug_jobs.sum()),
            "water_supplied_mt": int(mar.water_supplied_mt.sum()),
            "garbage_calls": int(mar.garbage_calls.sum()),
        }

    rev = _pf(s, "revenue", "port", year)
    revenue = {}
    if rev is not None:
        billed = float(rev.billed_cr.sum())
        collected = float(rev.collected_cr.sum())
        revenue = {
            "billed_cr": _n(billed, 2), "collected_cr": _n(collected, 2),
            "collection_pct": _n(100.0 * collected / billed, 1) if billed else None,
            "invoices": int(rev.invoices_issued.sum()),
        }

    # terminal league for the year
    topsq = _pf(s, "ops", "terminal", year)
    best_terms = []
    if topsq is not None:
        g = topsq.groupby("unit_name").agg(calls=("vessel_calls", "sum"),
                                           avg_waiting_hr=("avg_waiting_hr", "mean"),
                                           avg_turnaround_hr=("avg_turnaround_hr", "mean"))
        g = g[g.calls >= 6].sort_values("avg_waiting_hr")
        best_terms = [{"terminal": i, "avg_waiting_hr": _n(r.avg_waiting_hr),
                       "avg_turnaround_hr": _n(r.avg_turnaround_hr), "calls": int(r.calls)}
                      for i, r in g.head(3).iterrows()]
    thse = _pf(s, "hse", "terminal", year)
    attention_terms = []
    if thse is not None:
        g = thse.groupby("unit_name").agg(incidents=("incidents_total", "sum"),
                                          high_critical=("incidents_high_critical", "sum"),
                                          injuries=("injuries", "sum"))
        g = g.sort_values(["high_critical", "incidents"], ascending=False)
        attention_terms = [{"terminal": i, "incidents": int(r.incidents),
                            "high_critical": int(r.high_critical), "injuries": int(r.injuries)}
                           for i, r in g.head(3).iterrows()]

    # record-level highlights from the snapshot (graceful when absent)
    C = _collections()
    top_agents, workhorse_vessels, worst_vessel = [], [], {}
    vessels_seen = agents_active = None
    if C:
        vname = {str(v["_id"]): (v.get("name"), v.get("imo"), v.get("type"))
                 for v in C.get("vessels", [])}
        agents, per_vessel = {}, {}
        for c in C.get("portcalls", []):
            if c.get("status") != "SAILED" or not c.get("atd") or str(c["atd"])[:4] != y:
                continue
            a = c.get("agentName") or c.get("agentCode")
            if a:
                agents[a] = agents.get(a, 0) + 1
            vid = str(c.get("vessel"))
            if vid in vname:
                per_vessel[vid] = per_vessel.get(vid, 0) + 1
        vessels_seen = len(per_vessel) or None
        agents_active = len(agents) or None
        top_agents = [{"agent": a, "calls": n}
                      for a, n in sorted(agents.items(), key=lambda kv: -kv[1])[:3]]
        workhorse_vessels = [{"vessel": vname[v][0], "imo": vname[v][1],
                              "type": vname[v][2], "calls": n}
                             for v, n in sorted(per_vessel.items(), key=lambda kv: -kv[1])[:3]]
        inc_by_vessel = {}
        for i in C.get("incidents", []):
            if str(i.get("reportedAt") or "")[:4] != y:
                continue
            # fleet vessels attach via the `vessel` id ref; other craft only carry
            # the free-text vesselName
            ref = vname.get(str(i.get("vessel") or ""))
            nm = ref[0] if ref else (i.get("vesselName") or "").strip()
            if nm:
                inc_by_vessel[nm] = inc_by_vessel.get(nm, 0) + 1
        if inc_by_vessel:
            wv, n = sorted(inc_by_vessel.items(), key=lambda kv: -kv[1])[0]
            worst_vessel = {"vessel": wv, "incidents": n}
    if vessels_seen:
        traffic["vessels_seen"] = vessels_seen
    if agents_active:
        traffic["agents_active"] = agents_active

    prev = None
    prev_ops = _pf(s, "ops", "port", year - 1)
    if prev_ops is not None:
        prev_hse = _pf(s, "hse", "port", year - 1)
        prev = {"calls": int(prev_ops.vessel_calls.sum()),
                "cargo_mmt": _n(prev_ops.cargo_mt.sum() / 1e6, 2),
                "incidents": int(prev_hse.incidents_total.sum()) if prev_hse is not None else None}

    return {"year": year, "partial": year == dt.date.today().year,
            "traffic": traffic, "busiest_month": busiest,
            "incidents": incidents, "incidents_worst_month": inc_worst,
            "inspections": inspections, "services": services, "revenue": revenue,
            "best_terminals": best_terms, "attention_terminals": attention_terms,
            "top_agents": top_agents, "workhorse_vessels": workhorse_vessels,
            "worst_vessel": worst_vessel, "vs_previous_year": prev}


_NARR_SYS = (
    "You are Sagar Drishti writing the CAPTIONS for a cinematic 'Year Gone By' review shown to "
    "Mundra Port and terminal leadership — like a year-in-review reel. From the STATS JSON, "
    "write ONLY a JSON object with these string keys (each 1-2 punchy sentences, confident, "
    "warm, specific numbers from STATS, no jargon, no invented figures):\n"
    '{"opening": the year in one breath, "volume": the traffic & cargo story, "speed": the '
    'turnaround & waiting story, "money": the billing & collections story (honest), '
    '"heroes_terminals": celebrating the best-flowing terminals, "attention_terminals": the '
    'terminals needing attention (constructive, not shaming), "heroes_agents": celebrating the '
    'busiest shipping agents by name, "workhorses": the hardest-working vessels by name, '
    '"vessel": the most incident-prone vessel (factual, not accusatory), "closing": the '
    'look-ahead line}.\n'
    "Output the JSON only.")


def _narr_path(year):
    return os.path.join(_STATE, f"yearbook_narrative_{year}.json")


def _gen_narrative(year, stats):
    try:
        raw = claude_cli.complete("STATS:\n" + json.dumps(stats, default=str)[:12000] +
                                  "\n\nWrite the caption JSON.",
                                  system=_NARR_SYS, model=config.AGENT_MODEL, timeout=180)
        import re
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            narr = json.loads(m.group(0))
            with _lock:
                json.dump(narr, open(_narr_path(year), "w"), ensure_ascii=False, indent=1)
    finally:
        _generating.discard(year)


@router.get("/{year}")
def yearbook(year: int):
    if year < 2023 or year > dt.date.today().year:
        raise HTTPException(404, f"No data for {year}")
    stats = _stats(year)
    narrative = None
    try:
        narrative = json.load(open(_narr_path(year)))
    except Exception:
        if claude_cli.available() and year not in _generating:
            _generating.add(year)
            threading.Thread(target=_gen_narrative, args=(year, stats), daemon=True).start()
    return {"stats": stats, "narrative": narrative,
            "years_available": list(range(2023, dt.date.today().year + 1))}
