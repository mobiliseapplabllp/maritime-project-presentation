"""
3D Mundra port twin — joins the terminal GeoJSON with the unit metrics and the
composite TERMINAL-RISK score (higher = worse) from the analysis pipeline.
Scope-aware: out-of-scope terminals are returned uncoloured (metrics null).
"""
import json
import os
import threading

import pandas as pd

from . import config
from .data import get_store

GEO_PATH = os.path.join(config.GEO_DIR, "mundra_terminals.geojson")

# Composite weights (mirrors analyze_mundra.py hotspot_ranking)
_W = {"incident_rate": 0.35, "waiting": 0.25, "high_severity": 0.25, "detentions": 0.15}

_CACHE_LOCK = threading.Lock()
_GEO = None


def _geo():
    global _GEO
    if _GEO is None:
        with open(GEO_PATH) as f:
            _GEO = json.load(f)
    return _GEO


def _build():
    """Terminal metrics keyed by unit_id, blending unit_latest with the
    trailing-12-month hotspot ranking (which carries the composite risk)."""
    s = get_store()
    ul = s.unit_latest
    t = ul[ul.level == "terminal"].copy()
    hs = s.frames.get("hotspot_ranking")
    if hs is not None:
        t = t.merge(hs[["unit_id", "risk_score", "inc_per_100", "incidents", "hi", "dets"]],
                    on="unit_id", how="left")
    metrics = {}
    for _, r in t.iterrows():
        def num(v, nd=1):
            return round(float(v), nd) if pd.notna(v) else None
        metrics[r.unit_id] = {
            "name": r.unit_name, "unit_id": r.unit_id,
            "risk": num(r.get("risk_score")),
            "vessel_calls": int(r.vessel_calls) if pd.notna(r.vessel_calls) else 0,
            "cargo_mt": int(r.cargo_mt) if pd.notna(r.cargo_mt) else 0,
            "teu": int(r.teu) if pd.notna(r.teu) else 0,
            "avg_waiting_hr": num(r.get("avg_waiting_hr")),
            "avg_turnaround_hr": num(r.get("avg_turnaround_hr")),
            "occupancy_pct": num(r.get("occupancy_pct")),
            "incidents_12m": int(r.get("incidents") or 0),
            "high_severity_12m": int(r.get("hi") or 0),
            "detentions_12m": int(r.get("dets") or 0),
            "outstanding_cr": num(r.get("outstanding_cr")),
        }
    ranked = sorted([m for m in metrics.values() if m["risk"] is not None],
                    key=lambda m: -m["risk"])
    for i, m in enumerate(ranked, 1):
        metrics[m["unit_id"]]["risk_rank"] = i
    return metrics


_METRIC_DEFS = [
    {"key": "risk", "label": "Composite terminal risk", "unit": "/100",
     "desc": "Weighted blend over trailing 12 months: incident rate 35%, waiting "
             "25%, high-severity incidents 25%, PSC detentions 15%. Higher = worse."},
    {"key": "vessel_calls", "label": "Vessel calls", "unit": "", "desc": "Calls completed in the latest month."},
    {"key": "cargo_mt", "label": "Cargo handled", "unit": "MT", "desc": "Tonnes across all commodities."},
    {"key": "avg_waiting_hr", "label": "Avg pre-berthing wait", "unit": "h", "desc": "Hours at anchorage before berthing."},
    {"key": "avg_turnaround_hr", "label": "Avg turnaround", "unit": "h", "desc": "Arrival to sailing, per call."},
    {"key": "occupancy_pct", "label": "Berth occupancy", "unit": "%", "desc": "Occupied berth-hours vs available."},
    {"key": "incidents_12m", "label": "Incidents (12m)", "unit": "", "desc": "HSE/marine incidents in the trailing year."},
    {"key": "outstanding_cr", "label": "Outstanding", "unit": "₹Cr", "desc": "Billed minus collected, cumulative."},
]


def payload(user=None):
    s = get_store()
    with _CACHE_LOCK:
        metrics = _build()
    visible_ids = None
    if user and s.scope_of(user) not in ("port", "state"):
        vis = s.visible(s.unit_latest, user)
        vt = vis[vis.level == "terminal"]
        visible_ids = set(vt.unit_id.tolist())
    terminals = {}
    for uid, m in metrics.items():
        if visible_ids is not None and uid not in visible_ids:
            terminals[uid] = {"name": m["name"], "unit_id": uid, "risk": None, "in_scope": False}
        else:
            terminals[uid] = {**m, "in_scope": True}
    return {"geojson": _geo(), "terminals": terminals, "districts": terminals,
            "metric_defs": _METRIC_DEFS, "latest_ym": s.latest_month}
