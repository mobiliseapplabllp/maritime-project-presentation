"""Analytics endpoints — one per portal screen, every unit list scope-filtered
by the caller's RBAC scope (data.Store.visible)."""
import math

import numpy as np
from fastapi import APIRouter, Body, Depends, HTTPException

from .auth import current_user
from .data import get_store
from . import agents as agent_mod
from . import config

router = APIRouter(prefix="/api", dependencies=[Depends(current_user)])

try:
    from .finding_details import attach as _attach_detail
except Exception:
    def _attach_detail(f):
        return f


def attach_detail(f):
    try:
        return _attach_detail(f)
    except Exception:
        return f


# ---- Agent workforce ----
@router.get("/agents")
def agents_list():
    cfg = agent_mod.get_config()
    sc = cfg["schedule"]
    return {"agents": agent_mod.agents_status(), "config": cfg,
            "schedule": {"hour": sc["hour"], "mode": sc["mode"],
                         "interval_hours": sc["interval_hours"], "enabled": sc["enabled"],
                         "next_run": agent_mod.next_scheduled()}}


@router.get("/agents/config")
def agents_config():
    return {"config": agent_mod.get_config()}


@router.put("/agents/config")
def agents_config_update(patch: dict = Body(...)):
    return {"config": agent_mod.update_config(patch), "next_run": agent_mod.next_scheduled()}


@router.get("/facts")
def interesting_facts():
    import json as _j, os as _o
    fp = _o.path.join(config.ANALYSIS_DIR, "facts.json")
    if not _o.path.exists(fp):
        raise HTTPException(503, "Facts not built yet")
    return _j.load(open(fp))


@router.get("/agents/qa")
def qa_status_ep():
    from . import qa as qa_mod
    return qa_mod.qa_status()


@router.post("/agents/qa/run")
def qa_run_ep():
    from . import qa as qa_mod
    import threading as _t
    out = {}
    th = _t.Thread(target=lambda: out.update(qa_mod.run_qa_cycle(trigger="manual")), daemon=True)
    th.start()
    return {"started": True, "note": "cycle running in background; poll GET /api/agents/qa"}


@router.put("/agents/qa/config")
def qa_config_ep(patch: dict = Body(...)):
    from . import qa as qa_mod
    return {"config": qa_mod.set_cfg(patch)}


@router.get("/agents/cycle/last")
def agents_last_cycle():
    return {"cycle": agent_mod.last_cycle()}


@router.post("/agents/run")
def agents_run():
    return {"run_id": agent_mod.start_cycle(trigger="manual")}


@router.get("/agents/run/{run_id}")
def agents_run_status(run_id: str):
    run = agent_mod.get_run(run_id)
    if not run:
        raise HTTPException(404, "run not found")
    return run


@router.get("/agents/{aid}/memory")
def agents_memory(aid: str):
    mem = agent_mod.agent_memory(aid)
    if not mem:
        raise HTTPException(404, "agent not found")
    return mem


# ---------------------------------------------------------------- helpers
def clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if math.isnan(float(v)) else float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def recs(df):
    return [{k: clean(v) for k, v in r.items()} for r in df.to_dict(orient="records")]


def _home_row(s, user):
    hid = s.home_unit_id(user)
    row = s.unit_latest[s.unit_latest.unit_id == hid]
    return (row.iloc[0].to_dict() if len(row) else {}), hid


_SERIES_COLS = ["ym", "vessel_calls", "cargo_mt", "teu", "avg_turnaround_hr",
                "avg_waiting_hr", "berthed_lt6h_pct", "occupancy_pct"]


# ---------------------------------------------------------------- overview
@router.get("/overview")
def overview(user=Depends(current_user)):
    s = get_store()
    home, hid = _home_row(s, user)
    ops = s.frames.get("ops")
    hs = ops[ops.unit_id == hid].sort_values("ym") if ops is not None else None
    cols = [c for c in _SERIES_COLS if hs is not None and c in hs.columns]
    series = recs(hs[cols]) if hs is not None and len(hs) else []
    sev = {"high": 0, "medium": 0, "low": 0}
    for f in s.findings:
        sev[f.get("severity", "low")] = sev.get(f.get("severity", "low"), 0) + 1

    bm = s.benchmark
    fr = clean(home.get("findings_raised"))
    fc = clean(home.get("findings_closed"))
    kpis = {
        "avg_turnaround_hr": clean(home.get("avg_turnaround_hr")),
        "turnaround_target_hr": clean(bm.get("turnaround_target_hr", 50.4)),
        "avg_waiting_hr": clean(home.get("avg_waiting_hr")),
        "preberthing_target_hr": clean(bm.get("preberthing_target_hr", 5.0)),
        "vessel_calls_month": clean(home.get("vessel_calls")),
        "cargo_mt": clean(home.get("cargo_mt")),
        "teu": clean(home.get("teu")),
        "berthed_lt6h_pct": clean(home.get("berthed_lt6h_pct")),
        "occupancy_pct": clean(home.get("occupancy_pct")),
        "incidents_month": clean(home.get("incidents_total", 0)),
        "incidents_high_critical": clean(home.get("incidents_high_critical", 0)),
        "detentions": clean(home.get("detentions", 0)),
        "findings_closure_pct": (round(100.0 * fc / fr, 1) if fr else None),
        "outstanding_cr": clean(home.get("outstanding_cr", 0)),
        "collection_pct": clean(home.get("collection_pct")),
        "months": len(series),
    }
    return {
        "meta": s.meta, "latest_month": s.latest_month,
        "scope": {"scope": user["scope"], "persona": user.get("persona"),
                  "org": user.get("org"), "unit_name": home.get("unit_name", "Port Authority"),
                  "level": home.get("level", "port")},
        "home_series": series, "kpis": kpis,
        "severity_counts": sev, "findings_count": len(s.findings),
    }


# ---------------------------------------------------------------- findings
try:
    import json as _fjson, os as _fos
    _FINDINGS_I18N = _fjson.load(open(_fos.path.join(config.ANALYSIS_DIR, "findings_i18n.json")))
except Exception:
    _FINDINGS_I18N = {}


def _localize_finding(f, lang):
    tr = _FINDINGS_I18N.get(lang, {}).get(f.get("id"))
    if not tr:
        return f
    out = dict(f)
    out["title"] = tr.get("title") or f.get("title")
    out["inference"] = tr.get("inference") or f.get("inference")
    return out


@router.get("/findings")
def findings(area: str = None, lang: str = "en"):
    s = get_store()
    fs = s.findings
    if area:
        fs = [f for f in fs if f.get("area") == area]
    return {"findings": [_localize_finding(attach_detail(f), lang) for f in fs]}


@router.get("/findings/{fid}")
def finding_one(fid: str, lang: str = "en"):
    s = get_store()
    for f in s.findings:
        if f.get("id") == fid:
            return _localize_finding(attach_detail(f), lang)
    raise HTTPException(404, f"Finding '{fid}' not found")


# ---------------------------------------------------------------- units (scoped)
_UNIT_COLS = ["unit_id", "unit_name", "level", "zone", "terminal", "vessel_calls",
              "cargo_mt", "teu", "avg_turnaround_hr", "avg_waiting_hr",
              "calls_waited_gt24h", "berthed_lt6h_pct", "occupancy_pct",
              "incidents_total", "incidents_high_critical", "injuries", "detentions",
              "inspections_done", "findings_raised", "findings_closed",
              "outstanding_cr", "collection_pct"]


@router.get("/units")
def units(user=Depends(current_user)):
    """Child units the caller can drill into (port→zones, zone→terminals, terminal→berths)."""
    s = get_store()
    vis = s.visible(s.unit_latest, user)
    child = s.child_level(user)
    df = vis[vis.level == child].copy()
    if not len(df):  # berth scope: show the single berth
        df = vis.copy()
    have = [c for c in _UNIT_COLS if c in df.columns]
    return {"level": child, "count": int(len(df)),
            "units": recs(df[have].sort_values(
                "avg_waiting_hr" if "avg_waiting_hr" in have else "unit_name",
                ascending=False))}


@router.get("/units/{unit_id}")
def unit_detail(unit_id: str, user=Depends(current_user)):
    s = get_store()
    vis = s.visible(s.unit_latest, user)
    row = vis[vis.unit_id == unit_id]
    if not len(row):
        raise HTTPException(404, f"Unit '{unit_id}' not visible or not found")
    prof = recs(row)[0]
    ops = s.frames.get("ops")
    traj = ops[ops.unit_id == unit_id].sort_values("ym") if ops is not None else None
    tcols = [c for c in _SERIES_COLS if traj is not None and c in traj.columns]
    trajectory = recs(traj[tcols]) if traj is not None and len(traj) else []

    def latest_row(panel, cols):
        df = s.frames.get(panel)
        if df is None:
            return {}
        r = df[df.unit_id == unit_id].sort_values("ym") if "ym" in df.columns else df[df.unit_id == unit_id]
        if not len(r):
            return {}
        return {c: clean(r.iloc[-1][c]) for c in cols if c in r.columns}

    return {
        "unit_id": unit_id, "name": prof.get("unit_name"), "level": prof.get("level"),
        "zone": prof.get("zone"), "terminal": prof.get("terminal"),
        "profile": prof, "trajectory": trajectory,
        "marine": latest_row("marine", ["pilotage_moves", "tug_jobs", "water_supplied_mt",
                                        "garbage_calls", "inspections_done",
                                        "findings_raised", "findings_closed", "detentions"]),
        "hse": latest_row("hse", ["incidents_total", "incidents_high_critical", "injuries",
                                  "spills", "near_miss", "security_events",
                                  "equipment_failures", "avg_close_days"]),
        "revenue": latest_row("revenue", ["invoices_issued", "billed_cr", "collected_cr",
                                          "outstanding_cr", "collection_pct"]),
    }


# ---------------------------------------------------------------- reliability hotspots
@router.get("/hotspots")
def hotspots(user=Depends(current_user)):
    s = get_store()
    rel = s.frames.get("vessel_reliability")
    vis = s.visible(s.unit_latest, user)
    child = s.child_level(user)
    units = vis[vis.level == child].copy()
    worst_waiting = units.dropna(subset=["avg_waiting_hr"]).sort_values(
        "avg_waiting_hr", ascending=False).head(15)
    busiest = units.sort_values("vessel_calls", ascending=False).head(15)
    ucols = ["unit_name", "terminal", "avg_waiting_hr", "avg_turnaround_hr", "vessel_calls",
             "cargo_mt", "incidents_total", "detentions"]
    return {
        "vessel_reliability": recs(rel.head(15)) if rel is not None else [],
        "worst_waiting_units": recs(worst_waiting[[c for c in ucols if c in worst_waiting.columns]]),
        "highest_load_units": recs(busiest[[c for c in ucols if c in busiest.columns]]),
    }


# ---------------------------------------------------------------- benchmark compliance
@router.get("/compliance")
def compliance(user=Depends(current_user)):
    s = get_store()
    bm = s.benchmark
    vis = s.visible(s.unit_latest, user)
    child = s.child_level(user)
    df = vis[vis.level == child].copy()
    tt = float(bm.get("turnaround_target_hr", 50.4))
    wt = float(bm.get("preberthing_target_hr", 5.0))
    ct = float(bm.get("collection_target_pct", 95.0))
    if "avg_turnaround_hr" in df.columns:
        df["turnaround_gap"] = (df.avg_turnaround_hr - tt).round(1)
    if "avg_waiting_hr" in df.columns:
        df["waiting_gap"] = (df.avg_waiting_hr - wt).round(1)
    if "collection_pct" in df.columns:
        df["collection_gap"] = (df.collection_pct - ct).round(1)
    cols = ["unit_name", "terminal", "avg_turnaround_hr", "turnaround_gap",
            "avg_waiting_hr", "waiting_gap", "occupancy_pct", "collection_pct",
            "collection_gap", "detentions", "outstanding_cr"]
    have = [c for c in cols if c in df.columns]
    breaching = (df[df.get("avg_turnaround_hr", 0) > tt]
                 if "avg_turnaround_hr" in df.columns else df.head(0))
    return {"targets": {k: clean(v) for k, v in bm.items()},
            "units": recs(df[have].sort_values(
                "turnaround_gap" if "turnaround_gap" in have else "unit_name",
                ascending=False)),
            "breaching_count": int(len(breaching)),
            "findings": [f for f in s.findings
                         if f.get("area") in ("benchmark", "revenue")]}


# ---------------------------------------------------------------- marine services (was maintenance)
@router.get("/maintenance")
def maintenance(user=Depends(current_user)):
    s = get_store()
    mar = s.frames.get("marine")
    out = {"findings": [f for f in s.findings if f.get("area") in ("hse", "hotspot")]}
    if mar is not None:
        vis = s.visible(mar, user)
        child = s.child_level(user)
        lm = mar.ym.max()
        d = vis[(vis.level == child) & (vis.ym == lm)].copy()
        if "findings_raised" in d.columns and "findings_closed" in d.columns:
            d["findings_closure_pct"] = (100.0 * d.findings_closed /
                                         d.findings_raised.replace(0, np.nan)).round(1)
        cols = ["unit_name", "terminal", "pilotage_moves", "tug_jobs", "water_supplied_mt",
                "garbage_calls", "inspections_done", "findings_raised", "findings_closed",
                "findings_closure_pct", "detentions"]
        out["units"] = recs(d[[c for c in cols if c in d.columns]].sort_values(
            "inspections_done" if "inspections_done" in d.columns else "unit_name",
            ascending=False))
        out["latest_month"] = str(lm)
    return out


# ---------------------------------------------------------------- predictions (congestion)
@router.get("/predictions")
def predictions(user=Depends(current_user)):
    s = get_store()
    ops = s.frames.get("ops")
    home, hid = _home_row(s, user)
    out = {"findings": [f for f in s.findings if f.get("area") == "prediction"]}
    if ops is not None:
        hs = ops[ops.unit_id == hid].sort_values("ym")
        out["wait_trend"] = recs(hs[["ym", "avg_waiting_hr", "avg_turnaround_hr",
                                     "vessel_calls"]])
        # simple next-month projection of anchorage waiting (linear fit on last 12)
        tail = hs.dropna(subset=["avg_waiting_hr"]).tail(12)
        if len(tail) >= 4:
            y = tail.avg_waiting_hr.values.astype(float)
            x = np.arange(len(y))
            slope, intercept = np.polyfit(x, y, 1)
            out["projection"] = {"next_month_avg_waiting_hr": clean(round(float(slope * len(y) + intercept), 1)),
                                 "slope_hr_per_month": clean(round(float(slope), 2))}
    return out


# ---------------------------------------------------------------- port benchmark (was region)
@router.get("/region")
def region(user=Depends(current_user)):
    s = get_store()
    ul = s.unit_latest
    zones = ul[ul.level == "zone"]
    terminals = ul[ul.level == "terminal"]
    zcols = ["unit_name", "vessel_calls", "cargo_mt", "teu", "avg_turnaround_hr",
             "avg_waiting_hr", "occupancy_pct", "incidents_total", "detentions",
             "outstanding_cr"]
    tcols = zcols + ["zone"]
    return {
        "latest_month": s.latest_month,
        "zones": recs(zones[[c for c in zcols if c in zones.columns]].sort_values(
            "avg_waiting_hr", ascending=False)),
        "terminals": recs(terminals[[c for c in tcols if c in terminals.columns]].sort_values(
            "avg_waiting_hr", ascending=False)),
        "port": recs(ul[ul.level == "port"][[c for c in zcols if c in ul.columns]]),
    }


# ---- Work orders ----
from typing import Optional
from pydantic import BaseModel as _BM
from . import workorders as wo_mod


class WOCreate(_BM):
    title: str = ""
    description: str = ""
    unit: Optional[str] = None
    terminal: Optional[str] = None
    category: str = "marine_operations"
    priority: str = "medium"
    sla_days: Optional[int] = None
    assignee_role: Optional[str] = None
    suggested_actions: list = []
    finding_id: Optional[str] = None


class WOPatch(_BM):
    status: Optional[str] = None
    note: Optional[str] = None
    assignee_role: Optional[str] = None


def _wo_list(terminal, status, source):
    return wo_mod.list_orders(terminal=terminal or None, status=status or None,
                              source_type=source or None)


@router.get("/workorders")
def workorders(terminal: str = "", status: str = "", source: str = ""):
    return _wo_list(terminal, status, source)


@router.get("/workorders/roles")
def workorder_roles():
    return {"roles": wo_mod.roles_directory()}


@router.post("/workorders")
def workorder_create(body: WOCreate, user=Depends(current_user)):
    if body.finding_id:
        s = get_store()
        f = next((x for x in s.findings if x.get("id") == body.finding_id), None)
        if not f:
            raise HTTPException(404, f"Finding {body.finding_id} not found")
        return wo_mod.create_from_finding(f, created_by=user.get("name", "user"))
    payload = body.dict()
    if body.terminal and not payload.get("unit"):
        payload["unit"] = body.terminal
    if body.assignee_role:
        payload["assignee"] = wo_mod._assignee_from_role(body.assignee_role)
    return wo_mod.create(payload, created_by=user.get("name", "user"))


@router.post("/workorders/generate")
def workorder_generate(user=Depends(current_user)):
    created = wo_mod.generate_from_ai(created_by=user.get("name", "user"))
    return {"created": len(created), "orders": created}


@router.patch("/workorders/{wid}")
def workorder_update(wid: str, body: WOPatch, user=Depends(current_user)):
    patch = {"status": body.status, "note": body.note}
    if body.assignee_role:
        patch["assignee"] = wo_mod._assignee_from_role(body.assignee_role)
    out = wo_mod.update(wid, patch, by=user.get("name", "user"))
    if not out:
        raise HTTPException(404, f"{wid} not found")
    return out


# ---- Neural TTS proxy (Kokoro sidecar on :8020) ----
import urllib.request as _urlreq
import json as _json
from fastapi import Response as _Resp

_TTS_URL = "http://127.0.0.1:8020"


class TTSBody(_BM):
    text: str
    lang: str = "en"
    gender: str = "female"


@router.get("/tts/status")
def tts_status():
    try:
        with _urlreq.urlopen(f"{_TTS_URL}/status", timeout=2) as r:
            _json.loads(r.read())
            return {"available": True, "langs": ["en"], "engine": "Clarity Neural (on-device)"}
    except Exception:
        return {"available": False}


@router.post("/tts")
def tts_synthesize(body: TTSBody):
    try:
        req = _urlreq.Request(f"{_TTS_URL}/tts",
                              data=_json.dumps({"text": body.text[:1200], "lang": body.lang,
                                                "gender": body.gender}).encode(),
                              headers={"Content-Type": "application/json"})
        with _urlreq.urlopen(req, timeout=120) as r:
            return _Resp(content=r.read(), media_type="audio/wav")
    except Exception:
        raise HTTPException(503, "Neural TTS unavailable")


# ---- Heatmap / 3D the port twin ----
from . import heatmap as hm_mod


@router.get("/heatmap")
def heatmap_data(user=Depends(current_user)):
    return hm_mod.payload(user)


# ---- Unit deep-dive AI intelligence report ----
import threading as _threading
import os as _os
from . import claude_cli as _cli

_DR_PATH = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "agent_state", "unit_reports.json")
_DR_LOCK = _threading.Lock()
try:
    _DR_CACHE = _json.load(open(_DR_PATH))
except Exception:
    _DR_CACHE = {}

_UNIT_SYSTEM = (
    "You are the Sagar Drishti analyst inside Maritime AI Analytics (port-operations "
    "analytics for Port Authority, reference deployment). Write a COMPREHENSIVE PORT-OPERATIONS "
    "INTELLIGENCE REPORT for leadership about ONE unit (a cargo zone, terminal or berth), "
    "using ONLY the DATA provided. Plain, confident, jargon-light English (define terms in "
    "brackets). Markdown with EXACTLY these sections:\n"
    "## Executive snapshot\n(4-5 sentences: the unit in one breath — traffic standing, the "
    "single biggest risk, and the one action that matters most)\n"
    "## Traffic & throughput\n(vessel calls, cargo tonnes, TEU; trend; how the mix is shifting)\n"
    "## Service & congestion\n(turnaround vs the major-port ~50 h yardstick, anchorage waiting "
    "vs the ~5 h norm, berth-on-arrival %, occupancy vs the 40-70% healthy band — cite the "
    "values)\n"
    "## Marine services & inspections\n(pilotage/tug workload, inspections done, findings "
    "raised vs closed, detentions — closure discipline)\n"
    "## Safety & environment\n(incidents with the high/critical share, injuries, spills, "
    "near-miss reporting, close-out days)\n"
    "## Revenue & receivables\n(billed vs collected ₹ crore, collection % vs the 95% target, "
    "the outstanding book)\n"
    "## How it compares\n(vs the port average and vs 2-3 peer units from DATA.peers)\n"
    "## Risks & watch items\n(3-4 bullets, sharpest first)\n"
    "## Recommended actions\n(numbered, 4-6, each with WHO owns it — Harbour Master / "
    "Dy. Conservator / Terminal Manager / Marine Superintendent / HSE Manager / Finance "
    "Controller — and a timeframe; concrete enough to become work orders)\n\n"
    "600-900 words. Ground EVERY number in DATA — never invent. The demo world is fictional; "
    "benchmarks come from public major-port statistics. Never mention AI engines, tools or files.")


@router.get("/units/{unit_id}/analysis")
def unit_analysis(unit_id: str, user=Depends(current_user), lang: str = "en"):
    s = get_store()
    detail = unit_detail(unit_id, user)  # enforces scope + 404
    key = f"{unit_id}|{s.latest_month}"
    if key in _DR_CACHE:
        return {"unit_id": unit_id, "report": _DR_CACHE[key], "cached": True}
    if not _cli.available():
        raise HTTPException(503, "Sagar Drishti intelligence engine is offline")
    # peers: same-level units nearest by turnaround
    lvl = detail.get("level")
    peers_df = s.unit_latest[(s.unit_latest.level == lvl) & (s.unit_latest.unit_id != unit_id)].copy()
    tr = detail["profile"].get("avg_turnaround_hr") or 0
    if "avg_turnaround_hr" in peers_df.columns and len(peers_df):
        peers_df["d"] = (peers_df.avg_turnaround_hr - tr).abs()
        peers_df = peers_df.sort_values("d").head(3)
    pcols = [c for c in ["unit_name", "avg_turnaround_hr", "avg_waiting_hr", "vessel_calls",
                         "incidents_total"] if c in peers_df.columns]
    peers = recs(peers_df[pcols]) if len(peers_df) else []
    traj = detail.get("trajectory", [])
    payload_data = {"unit": detail.get("name"), "level": lvl, "latest_month": s.latest_month,
                    "profile": detail["profile"], "marine": detail["marine"],
                    "hse": detail["hse"], "revenue": detail["revenue"],
                    "trajectory_sampled": traj[:: max(1, len(traj) // 14)],
                    "benchmark_targets": s.benchmark, "peers": peers}
    prompt = ("DATA:\n" + _json.dumps(payload_data, default=str)[:22000] +
              "\n\nWrite the port-operations intelligence report for " + str(detail.get("name")) + ".")
    from .chat import lang_rule as _lang_rule
    text = _cli.complete(prompt, system=_UNIT_SYSTEM + _lang_rule(lang), model=config.AGENT_MODEL, timeout=240)
    with _DR_LOCK:
        _DR_CACHE[key] = text
        try:
            _json.dump(_DR_CACHE, open(_DR_PATH, "w"))
        except Exception:
            pass
    return {"unit_id": unit_id, "report": text, "cached": False}


# ---- Data Catalogue ----
from fastapi.responses import StreamingResponse
from . import datasets as ds_mod


@router.get("/data/catalog")
def data_catalog():
    return ds_mod.catalog()


@router.get("/data/{dataset_id}/export")
def data_export(dataset_id: str, q: str = ""):
    if dataset_id not in ds_mod._BY_ID:
        raise HTTPException(404, f"Dataset '{dataset_id}' not found")
    fname = f"{dataset_id}{'_search' if q else ''}.csv"
    return StreamingResponse(
        ds_mod.export_iter(dataset_id, q=q), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@router.get("/data/{dataset_id}")
def data_preview(dataset_id: str, offset: int = 0, limit: int = 50, q: str = ""):
    out = ds_mod.preview(dataset_id, offset=max(0, offset), limit=min(200, max(1, limit)), q=q)
    if out is None:
        raise HTTPException(404, f"Dataset '{dataset_id}' not found")
    return out


# ---- AI Reports (PDF download + email) ----
import re as _re2


def _report_fname(rep):
    base = _re2.sub(r"[^A-Za-z0-9]+", "_", rep["title"]).strip("_")[:60] or "report"
    return base + ".pdf"


_REPORT_LANGS = ("hi", "gu")


@router.get("/reports/pdf")
def report_pdf_dl(kind: str, scope: str = "", lang: str = "en"):
    from . import reports as rp
    try:
        rep, pdf = rp.report_pdf(kind, scope or None, lang if lang in _REPORT_LANGS else "en")
    except Exception as e:
        raise HTTPException(400, f"Report failed: {type(e).__name__}: {str(e)[:140]}")
    return StreamingResponse(iter([pdf]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{_report_fname(rep)}"'})


@router.post("/reports/email")
def report_email(body: dict = Body(...)):
    from . import reports as rp
    from . import mailer
    kind = body.get("kind")
    scope = (body.get("scope") or "").strip() or None
    to = (body.get("to") or "").strip()
    lang = body.get("lang", "en")
    if "@" not in to:
        raise HTTPException(400, "a valid recipient email is required")
    try:
        rep, pdf = rp.report_pdf(kind, scope, lang if lang in _REPORT_LANGS else "en")
    except Exception as e:
        raise HTTPException(400, f"Report failed: {type(e).__name__}: {str(e)[:140]}")
    html = rp.render_html(rep, for_email=True)
    ok, detail = mailer.send(to, rep["title"], html, text=rep["ai_md"],
                             attachments=[(_report_fname(rep), pdf, "application/pdf")])
    return {"ok": ok, "detail": detail, "to": to, "title": rep["title"]}


# ---------------- Market Intelligence (daily internet-research agent) ----------------
@router.get("/research/status")
def research_status():
    from . import research
    return {"status": research.status()}


@router.get("/research/{topic}")
def research_articles(topic: str, limit: int = 20):
    from . import research
    if topic not in research.TOPICS:
        raise HTTPException(404, "unknown research topic")
    return {"articles": research.articles(topic, max(1, min(limit, 60)))}


@router.post("/research/run")
def research_run(body: dict = Body(...), user=Depends(current_user)):
    """Trigger a live research run now (admin only — it makes real web calls)."""
    from . import research
    if not (user or {}).get("is_admin"):
        raise HTTPException(403, "admin only")
    topic = body.get("topic")
    if topic not in research.TOPICS:
        raise HTTPException(400, "topic must be one of: " + ", ".join(research.TOPICS))
    if not research.start_async(topic):    # atomic claim — no double runs
        return {"started": False, "detail": "a run for this topic is already in progress"}
    return {"started": True, "topic": topic,
            "detail": "researching now — the article appears in the feed in a few minutes"}
