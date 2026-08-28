"""Record-level drill-down API — master lists + record drawers.

Master lists are served from the port portal's demo snapshot (vessels, port
calls, inspections, HSE incidents, invoices, seafarers, berths), indexed once
in memory — the record-level world behind the ops/marine/hse/revenue panels.
Record detail endpoints assemble everything a drawer needs in one call;
/analysis returns a cached AI brief per record.

Everything degrades gracefully if the snapshot is absent (empty lists, 404s) —
there is no external database dependency.
"""
import datetime as dt
import json
import math
import os
import threading

from fastapi import APIRouter, Depends, HTTPException

from . import claude_cli, config
from .auth import current_user

router = APIRouter(prefix="/api/records", dependencies=[Depends(current_user)])

PAGE = 50

_lock = threading.Lock()
_cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                           "agent_state", "record_reports.json")
try:
    _reports = json.load(open(_cache_path))
except Exception:
    _reports = {}
_data_ver = None


def _lang_rule(lang):
    try:
        from .chat import lang_rule
        return lang_rule(lang)
    except Exception:
        return ""


def _fresh(s):
    """Drop cached AI briefs after a pipeline rebuild so they regenerate fresh."""
    global _data_ver, _reports
    v = getattr(s, "data_version", None)
    if v != _data_ver:
        _data_ver = v
        _reports = {}


# ================================================================ snapshot store
SNAPSHOT_PATH = os.environ.get(
    "SAGAR_SNAPSHOT",
    os.path.abspath(os.path.join(config.PROJECT_ROOT, "..", "portal", "frontend",
                                 "src", "demo", "snapshot.json")))

# Terminal registry: berth-code prefix -> (terminal_id, terminal_name, zone_name)
# (mirrors data/mundra/build_panels.py)
TERMINALS = {
    "CT1":  ("CT1", "Container Terminal 1", "Container"),
    "CT2":  ("CT2", "Container Terminal 2", "Container"),
    "CT3":  ("CT3", "Container Terminal 3", "Container"),
    "CT4":  ("CT4", "Container Terminal 4", "Container"),
    "CT5":  ("CT5", "Container Terminal 5", "Container"),
    "WB":   ("WBC", "West Basin Coal Terminal", "Dry Bulk & General"),
    "MP":   ("MPT", "Multipurpose Terminal", "Dry Bulk & General"),
    "RR":   ("RRT", "Ro-Ro Terminal", "Dry Bulk & General"),
    "LB":   ("LQB", "Liquid Terminal", "Liquid & Offshore"),
    "SPM":  ("SPM", "SPM Crude", "Liquid & Offshore"),
}


def _term_of(berth_code):
    for pre, t in TERMINALS.items():
        if str(berth_code or "").startswith(pre):
            return {"terminal_id": t[0], "terminal": t[1], "zone": t[2]}
    return {"terminal_id": None, "terminal": None, "zone": None}


def _iso(v):
    return str(v)[:19].replace("T", " ") if v else None


def _dtp(v):
    try:
        return dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def _hours(a, b):
    ta, tb = _dtp(a), _dtp(b)
    if not (ta and tb):
        return None
    return round((tb - ta).total_seconds() / 3600.0, 1)


def _cargo_mt(call):
    tot = 0.0
    for x in (call.get("cargoOps") or []):
        tot += float(x.get("qtyMT") or x.get("qty") or 0)
    return round(tot)


class _Snap:
    """Lazy, indexed view of the portal demo snapshot."""
    def __init__(self):
        self.ok = False
        C = {}
        try:
            C = json.load(open(SNAPSHOT_PATH)).get("collections", {})
            self.ok = bool(C)
        except Exception:
            C = {}
        self.vessels = {str(v["_id"]): v for v in C.get("vessels", [])}
        self.vessels_by_imo = {str(v.get("imo")): v for v in self.vessels.values()}
        self.berths = {str(b["_id"]): b for b in C.get("berths", [])}
        self.berths_by_code = {str(b.get("code")): b for b in self.berths.values()}
        self.portcalls = C.get("portcalls", [])
        self.calls_by_vcn = {str(c.get("vcn")): c for c in self.portcalls}
        self.calls_by_id = {str(c["_id"]): c for c in self.portcalls}
        self.inspections = C.get("inspections", [])
        self.insp_by_number = {str(i.get("number")): i for i in self.inspections}
        self.incidents = C.get("incidents", [])
        self.inc_by_number = {str(i.get("number")): i for i in self.incidents}
        self.invoices = C.get("invoices", [])
        self.seafarers = {str(s.get("cdcNo")): s for s in C.get("seafarers", [])}

        # per-vessel indexes
        self.calls_by_vessel = {}
        for c in self.portcalls:
            self.calls_by_vessel.setdefault(str(c.get("vessel")), []).append(c)
        for lst in self.calls_by_vessel.values():
            lst.sort(key=lambda c: str(c.get("ata") or c.get("eta") or ""), reverse=True)
        self.insp_by_vessel = {}
        for i in self.inspections:
            self.insp_by_vessel.setdefault(str(i.get("vessel")), []).append(i)
        # incidents attach to fleet vessels via the `vessel` id ref (the free-text
        # vesselName covers non-fleet craft, e.g. fishing boats)
        self.inc_by_vessel_id = {}
        for i in self.incidents:
            vid = str(i.get("vessel") or "")
            if vid and vid in self.vessels:
                self.inc_by_vessel_id.setdefault(vid, []).append(i)
        self.inc_by_berth_code = {}
        for i in self.incidents:
            code = self.berth_code(i.get("berth"))
            if code:
                self.inc_by_berth_code.setdefault(code, []).append(i)
        self.inv_by_vessel = {}
        for i in self.invoices:
            self.inv_by_vessel.setdefault(str(i.get("vessel")), []).append(i)

        # per-vessel rollup
        self.rollup = {}
        for vid, v in self.vessels.items():
            calls = self.calls_by_vessel.get(vid, [])
            sailed = [c for c in calls if c.get("status") == "SAILED" and c.get("atd")]
            terms = {}
            for c in sailed:
                t = self.call_terminal(c).get("terminal")
                if t:
                    terms[t] = terms.get(t, 0) + 1
            insp = self.insp_by_vessel.get(vid, [])
            fnd = [f for i in insp for f in (i.get("findings") or [])]
            incs = self.inc_by_vessel_id.get(vid, [])
            self.rollup[vid] = {
                "calls": len(sailed),
                "cargo_mt": sum(_cargo_mt(c) for c in sailed),
                "first_call": _iso(min((c.get("ata") for c in sailed), default=None)),
                "last_call": _iso(max((c.get("atd") for c in sailed), default=None)),
                "dominant_terminal": max(terms, key=terms.get) if terms else None,
                "incidents": len(incs),
                "inspections": len(insp),
                "findings": len(fnd),
                "findings_closed": sum(1 for f in fnd if f.get("status") == "CLOSED"),
                "detentions": sum(1 for i in insp if i.get("detention")),
            }

    def berth_code(self, berth_ref):
        b = self.berths.get(str(berth_ref or ""))
        return b.get("code") if b else None

    def call_terminal(self, call):
        return _term_of(self.berth_code(call.get("berth")))

    def incident_vessel(self, incident):
        """(vessel dict or None, display name) for an incident — fleet vessels come
        via the id ref; non-fleet craft only carry the free-text vesselName."""
        v = self.vessels.get(str(incident.get("vessel") or ""))
        if v:
            return v, v.get("name")
        nm = (incident.get("vesselName") or "").strip()
        return None, (nm or None)


_snap_obj = None
_snap_lock = threading.Lock()


def _snap():
    global _snap_obj
    if _snap_obj is None:
        with _snap_lock:
            if _snap_obj is None:
                _snap_obj = _Snap()
    return _snap_obj


def _watchlist_by_imo():
    """Watch scores from the analysis engine, keyed by IMO (empty if not built)."""
    try:
        from .data import get_store
        df = get_store().frames.get("vessel_watchlist")
        if df is None:
            return {}
        return {str(r["imo"]): {k: (None if (isinstance(v, float) and math.isnan(v)) else v)
                                for k, v in r.items()}
                for r in df.to_dict("records")}
    except Exception:
        return {}


def _page(rows, page):
    off = max(0, (page - 1) * PAGE)
    return {"total": len(rows), "page": page, "page_size": PAGE,
            "rows": rows[off:off + PAGE]}


def _match_q(q, *vals):
    ql = q.lower()
    return any(ql in str(v or "").lower() for v in vals)


# ================================================================ master lists
@router.get("/assets")
def assets_list(q: str = "", terminal: str = "", vtype: str = "", tier: str = "",
                watch: int = 0, sort: str = "calls", page: int = 1):
    """Vessel register (the fleet the port actually serves)."""
    S = _snap()
    wl = _watchlist_by_imo()
    rows = []
    for vid, v in S.vessels.items():
        r = S.rollup.get(vid, {})
        imo = str(v.get("imo"))
        w = wl.get(imo)
        dwt = float(v.get("dwt") or 0)
        row = {"imo": imo, "vessel": v.get("name"), "type": v.get("type"),
               "flag": v.get("flag"), "built": v.get("built"), "dwt": v.get("dwt"),
               "agent": v.get("agent"), "operator": v.get("operator"),
               "liner": bool(v.get("liner")), "terminal": r.get("dominant_terminal"),
               "calls": r.get("calls", 0), "cargo_mt": r.get("cargo_mt", 0),
               "incidents": r.get("incidents", 0), "inspections": r.get("inspections", 0),
               "findings": r.get("findings", 0), "detentions": r.get("detentions", 0),
               "watch_score": (w or {}).get("watch_score"), "last_call": r.get("last_call")}
        if q and not _match_q(q, row["imo"], row["vessel"], row["agent"], row["operator"], row["type"]):
            continue
        if terminal and row["terminal"] != terminal:
            continue
        if vtype and row["type"] != vtype:
            continue
        if tier == "lt50k" and not dwt < 50000:
            continue
        if tier == "50to150k" and not (50000 <= dwt <= 150000):
            continue
        if tier == "gt150k" and not dwt > 150000:
            continue
        if watch and not row["watch_score"]:
            continue
        rows.append(row)
    key = {"calls": lambda r: -(r["calls"] or 0),
           "incidents": lambda r: -(r["incidents"] or 0),
           "dwt": lambda r: -(r["dwt"] or 0),
           "watch": lambda r: -(r["watch_score"] or 0),
           "imo": lambda r: r["imo"]}.get(sort, lambda r: -(r["calls"] or 0))
    rows.sort(key=key)
    return _page(rows, page)


@router.get("/tickets")
def tickets_list(q: str = "", terminal: str = "", status: str = "", severity: str = "",
                 band: str = "", ym: str = "", sort: str = "recent", page: int = 1):
    """HSE incident register."""
    S = _snap()
    rows = []
    for i in S.incidents:
        code = S.berth_code(i.get("berth"))
        term = _term_of(code)
        close_hr = _hours(i.get("reportedAt"), i.get("closedAt") or i.get("resolvedAt"))
        row = {"incident": i.get("number"), "title": i.get("title"),
               "category": i.get("category"), "type": i.get("type"),
               "severity": i.get("severity"), "priority": i.get("priority"),
               "status": i.get("status"), "berth": code, "terminal": term.get("terminal"),
               "area": (i.get("location") or {}).get("area"),
               "vessel": S.incident_vessel(i)[1],
               "injuries": i.get("injuries"),
               "reported_at": _iso(i.get("reportedAt")), "closed_at": _iso(i.get("closedAt")),
               "close_hr": close_hr,
               "assigned_to": (i.get("assignedTo") or {}).get("name")}
        if q and not _match_q(q, row["incident"], row["title"], row["type"], row["berth"],
                              row["vessel"], row["area"]):
            continue
        if terminal and row["terminal"] != terminal:
            continue
        if status and row["status"] != status:
            continue
        if severity and row["severity"] != severity:
            continue
        if ym and str(i.get("reportedAt") or "")[:7] != ym:
            continue
        if band:
            h = close_hr
            ok = h is not None and {
                "lt24": h <= 24, "24to48": 24 < h <= 48, "48to5d": 48 < h <= 120,
                "5to7d": 120 < h <= 168, "gt7d": h > 168}.get(band, True)
            if not ok:
                continue
        rows.append(row)
    key = {"recent": lambda r: str(r["reported_at"] or ""),
           "slowest": lambda r: (r["close_hr"] or -1),
           "severity": lambda r: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(r["severity"], 9)}
    rows.sort(key=key.get(sort, key["recent"]),
              reverse=(sort in ("recent", "slowest")))
    return _page(rows, page)


@router.get("/pms")
def pms_list(q: str = "", terminal: str = "", status: str = "", itype: str = "",
             ym: str = "", sort: str = "recent", page: int = 1):
    """Inspection register (PSC / FSI / ISM boardings)."""
    S = _snap()
    rows = []
    for i in S.inspections:
        v = S.vessels.get(str(i.get("vessel")), {})
        pc = S.calls_by_id.get(str(i.get("portCall")), {})
        code = S.berth_code(pc.get("berth"))
        term = _term_of(code)
        fnd = i.get("findings") or []
        row = {"inspection": i.get("number"), "type": i.get("type"),
               "vessel": v.get("name"), "imo": v.get("imo"),
               "terminal": term.get("terminal"), "berth": code,
               "inspector": i.get("inspector"),
               "planned_at": _iso(i.get("plannedAt")), "closed_at": _iso(i.get("closedAt")),
               "status": i.get("status"), "result": i.get("result"),
               "detention": bool(i.get("detention")), "findings": len(fnd),
               "findings_closed": sum(1 for f in fnd if f.get("status") == "CLOSED")}
        if q and not _match_q(q, row["inspection"], row["vessel"], row["imo"],
                              row["inspector"], row["type"]):
            continue
        if terminal and row["terminal"] != terminal:
            continue
        if status and (row["status"] or "").lower() != status.lower():
            continue
        if itype and row["type"] != itype:
            continue
        if ym and str(i.get("plannedAt") or "")[:7] != ym:
            continue
        rows.append(row)
    rows.sort(key=lambda r: str(r["planned_at"] or ""), reverse=True)
    return _page(rows, page)


@router.get("/cals")
def cals_list(page: int = 1):
    """Statutory certificate register — vessel and seafarer certificates with
    expiry status (the periodic-revalidation stream of a port world)."""
    S = _snap()
    if not S.ok:
        return {"available": False, "aggregate": {},
                "note": "Certificate register pending the portal snapshot; this list lights "
                        "up automatically when it lands."}
    today = dt.date.today().isoformat()
    soon = (dt.date.today() + dt.timedelta(days=90)).isoformat()

    def _status(exp):
        e = str(exp or "")[:10]
        if not e:
            return "UNKNOWN"
        if e < today:
            return "EXPIRED"
        if e <= soon:
            return "EXPIRING"
        return "VALID"

    rows = []
    for v in S.vessels.values():
        for c in (v.get("certificates") or []):
            rows.append({"holder": v.get("name"), "holder_type": "vessel",
                         "imo": v.get("imo"), "cert_type": c.get("certType"),
                         "number": c.get("number"), "issuer": c.get("issuer"),
                         "issue_date": str(c.get("issueDate") or "")[:10] or None,
                         "expiry_date": str(c.get("expiryDate") or "")[:10] or None,
                         "status": _status(c.get("expiryDate"))})
    for s in S.seafarers.values():
        for c in (s.get("certificates") or []):
            rows.append({"holder": s.get("name"), "holder_type": "seafarer",
                         "cdc_no": s.get("cdcNo"), "cert_type": c.get("certType"),
                         "number": c.get("number"), "issuer": c.get("issuer"),
                         "issue_date": str(c.get("issueDate") or "")[:10] or None,
                         "expiry_date": str(c.get("expiryDate") or "")[:10] or None,
                         "status": _status(c.get("expiryDate"))})
    rows.sort(key=lambda r: (({"EXPIRED": 0, "EXPIRING": 1}).get(r["status"], 2),
                             str(r["expiry_date"] or "9999")))
    out = _page(rows, page)
    out["available"] = True
    return out


# ================================================================ berth explorer
def _berth_stats_12m():
    """Trailing-12-month aggregates per berth from the panels (empty if not built)."""
    out = {}
    try:
        from .data import get_store
        s = get_store()
        ops = s.frames.get("ops")
        hse = s.frames.get("hse")
        mar = s.frames.get("marine")
        if ops is None:
            return out
        months = sorted(ops.ym.astype(str).unique())[-12:]

        def agg(df, spec):
            if df is None:
                return {}
            d = df[(df.level == "berth") & (df.ym.astype(str).isin(months))]
            res = {}
            for uid, g in d.groupby("unit_id"):
                row = {}
                for col, how in spec.items():
                    if col not in g.columns:
                        continue
                    val = g[col].sum() if how == "sum" else g[col].mean()
                    row[col] = None if (isinstance(val, float) and math.isnan(val)) else round(float(val), 1)
                res[str(uid)] = row
            return res

        o = agg(ops, {"vessel_calls": "sum", "cargo_mt": "sum", "teu": "sum",
                      "avg_turnaround_hr": "mean", "avg_waiting_hr": "mean",
                      "occupancy_pct": "mean", "berthed_lt6h_pct": "mean"})
        h = agg(hse, {"incidents_total": "sum", "incidents_high_critical": "sum",
                      "injuries": "sum", "spills": "sum"})
        m = agg(mar, {"inspections_done": "sum", "findings_raised": "sum",
                      "detentions": "sum"})
        for uid in set(list(o) + list(h) + list(m)):
            out[uid] = {**o.get(uid, {}), **h.get(uid, {}), **m.get(uid, {})}
    except Exception:
        pass
    return out


def _berth_rows():
    S = _snap()
    stats = _berth_stats_12m()
    rows = []
    for code, b in S.berths_by_code.items():
        term = _term_of(code)
        st = stats.get(code, {})
        rows.append({"berth": code, "name": b.get("name"), "terminal": term.get("terminal"),
                     "zone": term.get("zone"), "btype": b.get("berthType"),
                     "status": b.get("status"), "loa_max": b.get("loaMax"),
                     "draft_max": b.get("draftMax"),
                     "calls": int(st.get("vessel_calls") or 0),
                     "cargo_mt": int(st.get("cargo_mt") or 0),
                     "avg_turnaround_hr": st.get("avg_turnaround_hr"),
                     "avg_waiting_hr": st.get("avg_waiting_hr"),
                     "occupancy_pct": st.get("occupancy_pct"),
                     "berthed_lt6h_pct": st.get("berthed_lt6h_pct"),
                     "incidents": int(st.get("incidents_total") or 0),
                     "high_critical": int(st.get("incidents_high_critical") or 0),
                     "detentions": int(st.get("detentions") or 0)})
    return rows


@router.get("/facilities")
def facilities_list(q: str = "", terminal: str = "", zone: str = "", btype: str = "",
                    sort: str = "wait", page: int = 1):
    rows = _berth_rows()
    if q:
        rows = [r for r in rows if _match_q(q, r["berth"], r["name"], r["terminal"])]
    if terminal:
        rows = [r for r in rows if r["terminal"] == terminal]
    if zone:
        rows = [r for r in rows if r["zone"] == zone]
    if btype:
        rows = [r for r in rows if r["btype"] == btype]
    key = {"wait": lambda r: -(r["avg_waiting_hr"] or 0),
           "calls": lambda r: -(r["calls"] or 0),
           "cargo": lambda r: -(r["cargo_mt"] or 0),
           "incidents": lambda r: -(r["incidents"] or 0),
           "occupancy": lambda r: -(r["occupancy_pct"] or 0),
           "berth": lambda r: r["berth"]}.get(sort, lambda r: -(r["avg_waiting_hr"] or 0))
    rows.sort(key=key)
    return _page(rows, page)


@router.get("/facilities/summary")
def facilities_summary():
    rows = _berth_rows()
    tot_inc = sum(r["incidents"] for r in rows)
    with_wait = [r for r in rows if r["avg_waiting_hr"] is not None and r["calls"] >= 3]
    by_type = {}
    for r in rows:
        t = by_type.setdefault(r["btype"] or "OTHER",
                               {"btype": r["btype"] or "OTHER", "berths": 0, "calls": 0,
                                "cargo_mt": 0, "incidents": 0, "_w": []})
        t["berths"] += 1
        t["calls"] += r["calls"]
        t["cargo_mt"] += r["cargo_mt"]
        t["incidents"] += r["incidents"]
        if r["avg_waiting_hr"] is not None:
            t["_w"].append(r["avg_waiting_hr"])
    by_type_rows = []
    for t in by_type.values():
        w = t.pop("_w")
        t["avg_waiting_hr"] = round(sum(w) / len(w), 1) if w else None
        by_type_rows.append(t)
    by_type_rows.sort(key=lambda t: -t["incidents"])
    by_zone = {}
    for r in rows:
        z = by_zone.setdefault(r["zone"] or "—", {"zone": r["zone"] or "—", "berths": 0,
                                                  "calls": 0, "incidents": 0, "_w": []})
        z["berths"] += 1
        z["calls"] += r["calls"]
        z["incidents"] += r["incidents"]
        if r["avg_waiting_hr"] is not None:
            z["_w"].append(r["avg_waiting_hr"])
    by_zone_rows = []
    for z in by_zone.values():
        w = z.pop("_w")
        z["avg_waiting_hr"] = round(sum(w) / len(w), 1) if w else None
        by_zone_rows.append(z)
    by_zone_rows.sort(key=lambda z: -z["incidents"])
    inc_sorted = sorted(rows, key=lambda r: -r["incidents"])
    top5 = sum(r["incidents"] for r in inc_sorted[:5])
    top10 = sum(r["incidents"] for r in inc_sorted[:10])
    occ_bands = {"a_lt10": 0, "b_10_25": 0, "c_25_40": 0, "d_40_70": 0, "e_gt70": 0}
    for r in rows:
        o = r["occupancy_pct"]
        if o is None:
            continue
        if o < 10:
            occ_bands["a_lt10"] += 1
        elif o < 25:
            occ_bands["b_10_25"] += 1
        elif o < 40:
            occ_bands["c_25_40"] += 1
        elif o <= 70:
            occ_bands["d_40_70"] += 1
        else:
            occ_bands["e_gt70"] += 1
    cols = ["berth", "terminal", "avg_waiting_hr", "calls", "incidents"]
    return {
        "totals": {"berths": len(rows),
                   "operational": sum(1 for r in rows if r["status"] == "OPERATIONAL"),
                   "calls_12m": sum(r["calls"] for r in rows),
                   "cargo_12m_mt": sum(r["cargo_mt"] for r in rows),
                   "incidents_12m": tot_inc,
                   "avg_waiting_hr": round(sum(r["avg_waiting_hr"] for r in with_wait) /
                                           len(with_wait), 1) if with_wait else None},
        "by_type": by_type_rows,
        "worst_waiting": [{c: r[c] for c in cols}
                          for r in sorted(with_wait, key=lambda r: -(r["avg_waiting_hr"] or 0))[:8]],
        "best_service": [{"berth": r["berth"], "terminal": r["terminal"],
                          "berthed_lt6h_pct": r["berthed_lt6h_pct"], "calls": r["calls"]}
                         for r in sorted([x for x in rows if x["berthed_lt6h_pct"] is not None
                                          and x["calls"] >= 3],
                                         key=lambda r: -(r["berthed_lt6h_pct"] or 0))[:8]],
        "top_incidents": [{"berth": r["berth"], "terminal": r["terminal"],
                           "incidents": r["incidents"], "high_critical": r["high_critical"],
                           "detentions": r["detentions"]} for r in inc_sorted[:8]],
        "concentration": {"top5_incident_share_pct":
                              round(100.0 * top5 / tot_inc, 1) if tot_inc else None,
                          "top10_incident_share_pct":
                              round(100.0 * top10 / tot_inc, 1) if tot_inc else None},
        "occupancy_distribution": [{"band": k, "n": v} for k, v in sorted(occ_bands.items())],
        "by_zone": by_zone_rows,
    }


_BERTH_EXPLORER_SYS = (
    "You are Sagar Drishti writing a PORTFOLIO brief on the whole berth estate of Port Authority "
    "for port and terminal leadership, from the SUMMARY JSON (24 berths, trailing 12 months). "
    "Cover: how the estate splits by berth type and which types run hottest; the waiting-time "
    "picture (where the >24 h anchorage tail concentrates); incident concentration (top-5/10 "
    "berths' share); occupancy headroom vs the 40-70% healthy band (the port sits far below — "
    "capacity is not the constraint); the berths needing attention vs the exemplars; and where "
    "a focused programme moves the number most. Markdown, 400-600 words, sections ## Headline, "
    "## The estate at a glance, ## Where it hurts, ## What good looks like, ## Recommended "
    "actions (numbered, owner+timeframe — owners from: Harbour Master / Dy. Conservator / "
    "Terminal Manager / Berth Supervisor / HSE Manager). Cite exact numbers only; never "
    "invent; the demo world is fictional and benchmarks come from public major-port statistics.")


@router.get("/facilities/analysis")
def facilities_analysis(user=Depends(current_user), lang: str = "en", force: int = 0):
    from .data import get_store
    s = get_store()
    _fresh(s)
    key = f"berth_explorer|{(user or {}).get('persona', 'operator')}|{s.latest_month}|{lang}"
    if not force and key in _reports:
        return {"report": _reports[key], "cached": True}
    if not claude_cli.available():
        raise HTTPException(503, "Sagar Drishti intelligence engine is offline")
    data = facilities_summary()
    text = claude_cli.complete("SUMMARY:\n" + json.dumps(data, default=str)[:16000] +
                               "\n\nWrite the berth-estate portfolio brief.",
                               system=_BERTH_EXPLORER_SYS + _lang_rule(lang),
                               model=config.AGENT_MODEL, timeout=200)
    with _lock:
        _reports[key] = text
        try:
            json.dump(_reports, open(_cache_path, "w"))
        except Exception:
            pass
    return {"report": text, "cached": False}


# ================================================================ record detail
def _vessel_risk_forecast(ident, monthly_inc):
    """Per-vessel incident outlook. Expected 12-month incidents = historical
    incident rate/yr; range from Poisson variability on the annual count.
    Purely on this vessel's own record, with an honest method + reasoning string
    and a watchlist/detention overlay."""
    inc = int(ident.get("incidents") or 0)
    calls = int(ident.get("calls") or 0)
    dets = int(ident.get("detentions") or 0)
    watch = ident.get("watch_score")
    fd = str(ident.get("first_call") or "")[:10]
    try:
        years = max((dt.date.today() - dt.date.fromisoformat(fd)).days / 365.25, 0.5)
    except Exception:
        years = 1.0
    base = {"window_years": round(years, 1), "incidents_to_date": inc,
            "detentions_to_date": dets, "calls_to_date": calls,
            "watch_score": watch}
    if inc <= 0:
        base.update({
            "expected_12mo": 0, "low": 0, "high": 0, "incidents_per_year": 0,
            "outlook": "clean",
            "method": "No incident on record — the forecast is nil on this vessel's own evidence.",
            "reasoning": "This vessel has a clean incident record across its calls at the port, so "
                         "its self-forecast is zero. It still warrants routine attention only "
                         "through the standard inspection programme."})
        return base
    ipy = inc / years
    lo = max(ipy - math.sqrt(ipy), 0)
    hi = ipy + math.sqrt(ipy)
    yr_ago = (dt.date.today() - dt.timedelta(days=365)).isoformat()[:7]
    recent = sum(int(r.get("incidents") or 0) for r in (monthly_inc or [])
                 if str(r.get("ym")) >= yr_ago)
    trend = "rising" if recent > ipy * 1.2 else ("easing" if recent < ipy * 0.6 else "steady")
    base.update({
        "expected_12mo": round(ipy, 1), "low": round(lo, 1), "high": round(hi, 1),
        "incidents_per_year": round(ipy, 1), "last12mo_incidents": recent, "outlook": trend,
        "method": "Expected 12-month incidents = historical incident rate per year on this "
                  "vessel's own record. Range from Poisson variability on the annual count (√λ).",
        "reasoning": (
            f"This vessel has {inc} recorded incident{'s' if inc != 1 else ''} across "
            f"{calls} calls over {years:.1f} years — about {ipy:.1f} a year. The expected "
            f"12-month count is ≈{ipy:.1f} (range {lo:.1f}–{hi:.1f}). Recent 12-month "
            f"incidents: {recent} ({trend}). "
            + (f"It also carries {dets} PSC/FSI detention{'s' if dets != 1 else ''} — targeted "
               "surveyor attendance on the next call is warranted. " if dets else "")
            + (f"Watch score {watch} places it on the vessel watchlist. " if watch else "")),
    })
    return base


@router.get("/twins/resolve")
def twin_resolve(device: str = "", group: str = ""):
    """Resolve the digital twin for a craft/equipment type (by name / type group)."""
    from . import twins_lib
    return {"twin": twins_lib.resolve(device, group)}


@router.get("/asset/{imo}")
def asset_detail(imo: str):
    """Vessel drawer — the path parameter is the vessel's IMO number."""
    S = _snap()
    v = S.vessels_by_imo.get(str(imo))
    if not v:
        raise HTTPException(404, f"Vessel IMO {imo} not found")
    vid = str(v["_id"])
    r = S.rollup.get(vid, {})
    wl = _watchlist_by_imo().get(str(v.get("imo")))
    ident = {"imo": v.get("imo"), "vessel": v.get("name"), "type": v.get("type"),
             "flag": v.get("flag"), "built": v.get("built"), "dwt": v.get("dwt"),
             "grt": v.get("grt"), "loa": v.get("loa"), "beam": v.get("beam"),
             "max_draft": v.get("maxDraft"), "teu_capacity": v.get("teuCapacity"),
             "agent": v.get("agent"), "owner": v.get("owner"), "operator": v.get("operator"),
             "manager": v.get("manager"), "class_society": v.get("classSociety"),
             "pi_club": v.get("piClub"), "port_of_registry": v.get("portOfRegistry"),
             "yard": v.get("yard"), "liner": bool(v.get("liner")), "status": v.get("status"),
             "last_drydock": str(v.get("lastDryDock") or "")[:10] or None,
             "next_drydock": str(v.get("nextDryDock") or "")[:10] or None,
             **r, "watch_score": (wl or {}).get("watch_score")}
    calls = []
    for c in S.calls_by_vessel.get(vid, [])[:100]:
        term = S.call_terminal(c)
        calls.append({"vcn": c.get("vcn"), "purpose": c.get("purpose"),
                      "status": c.get("status"), "berth": S.berth_code(c.get("berth")),
                      "terminal": term.get("terminal"), "agent": c.get("agentName"),
                      "ata": _iso(c.get("ata")), "atb": _iso(c.get("atb")),
                      "atd": _iso(c.get("atd")),
                      "waiting_hr": _hours(c.get("ata"), c.get("atb")),
                      "turnaround_hr": _hours(c.get("ata"), c.get("atd")),
                      "cargo_mt": _cargo_mt(c)})
    inspections = []
    for i in sorted(S.insp_by_vessel.get(vid, []),
                    key=lambda x: str(x.get("plannedAt") or ""), reverse=True)[:60]:
        fnd = i.get("findings") or []
        inspections.append({"number": i.get("number"), "type": i.get("type"),
                            "inspector": i.get("inspector"),
                            "planned_at": _iso(i.get("plannedAt")),
                            "closed_at": _iso(i.get("closedAt")), "status": i.get("status"),
                            "result": i.get("result"), "detention": bool(i.get("detention")),
                            "findings": len(fnd),
                            "findings_closed": sum(1 for f in fnd if f.get("status") == "CLOSED")})
    incidents = []
    monthly = {}
    for i in sorted(S.inc_by_vessel_id.get(vid, []),
                    key=lambda x: str(x.get("reportedAt") or ""), reverse=True):
        ymm = str(i.get("reportedAt") or "")[:7]
        if ymm:
            monthly[ymm] = monthly.get(ymm, 0) + 1
        if len(incidents) < 60:
            incidents.append({"number": i.get("number"), "title": i.get("title"),
                              "severity": i.get("severity"), "status": i.get("status"),
                              "berth": S.berth_code(i.get("berth")),
                              "reported_at": _iso(i.get("reportedAt")),
                              "closed_at": _iso(i.get("closedAt"))})
    today = dt.date.today().isoformat()
    certificates = [{"cert_type": c.get("certType"), "number": c.get("number"),
                     "issuer": c.get("issuer"),
                     "issue_date": str(c.get("issueDate") or "")[:10] or None,
                     "expiry_date": str(c.get("expiryDate") or "")[:10] or None,
                     "expired": (str(c.get("expiryDate") or "9999")[:10] < today)}
                    for c in (v.get("certificates") or [])]
    inc_hist = [{"ym": k, "incidents": n} for k, n in sorted(monthly.items())]
    forecast = _vessel_risk_forecast(ident, inc_hist)
    return {"identity": ident, "calls": calls, "inspections": inspections,
            "incidents": incidents, "certificates": certificates, "intel": wl,
            "incident_history": inc_hist, "risk_forecast": forecast,
            "gaps": {"claims": "P&I claims and off-port casualty history live outside the "
                               "portal — this record covers the port calls only",
                     "ownership": "beneficial-ownership chains are not recorded; agent and "
                                  "operator are the working commercial contacts"}}


@router.get("/ticket/{tid}")
def ticket_detail(tid: str):
    """HSE incident drawer — the path parameter is the incident number (INC-…)."""
    S = _snap()
    i = S.inc_by_number.get(str(tid))
    if not i:
        raise HTTPException(404, f"Incident {tid} not found")
    code = S.berth_code(i.get("berth"))
    term = _term_of(code)
    ivessel, ivname = S.incident_vessel(i)
    inc = {"incident": i.get("number"), "title": i.get("title"),
           "description": i.get("description"), "category": i.get("category"),
           "type": i.get("type"), "severity": i.get("severity"),
           "priority": i.get("priority"), "status": i.get("status"),
           "berth": code, "terminal": term.get("terminal"), "zone": term.get("zone"),
           "area": (i.get("location") or {}).get("area"),
           "vessel": ivname,
           "reported_by": i.get("reportedBy"), "source": i.get("source"),
           "injuries": i.get("injuries"), "pollution_tier": i.get("pollutionTier"),
           "weather": i.get("weather"), "outcome": i.get("outcome")}
    timeline = {"reported_at": _iso(i.get("reportedAt")),
                "acknowledged_at": _iso(i.get("acknowledgedAt")),
                "resolved_at": _iso(i.get("resolvedAt")),
                "closed_at": _iso(i.get("closedAt")),
                "response_hr": _hours(i.get("reportedAt"), i.get("acknowledgedAt")),
                "close_hr": _hours(i.get("reportedAt"), i.get("closedAt") or i.get("resolvedAt"))}
    tasks = [{"title": t.get("title"), "assignee": t.get("assignee"),
              "due": _iso(t.get("due")), "status": t.get("status"),
              "done_at": _iso(t.get("doneAt"))} for t in (i.get("tasks") or [])]
    comms = [{"at": _iso(c.get("at")), "by": c.get("by"), "channel": c.get("channel"),
              "direction": c.get("direction"), "message": c.get("message")}
             for c in (i.get("comms") or [])[-8:]]
    vessel = None
    if ivessel:
        r = S.rollup.get(str(ivessel["_id"]), {})
        vessel = {"vessel": ivname, "imo": ivessel.get("imo"), "type": ivessel.get("type"),
                  "agent": ivessel.get("agent"), "total_incidents": r.get("incidents"),
                  "calls": r.get("calls"), "detentions": r.get("detentions")}
    elif ivname:
        vessel = {"vessel": ivname, "imo": None, "type": None, "agent": None,
                  "total_incidents": None, "calls": None, "detentions": None}
    seq = None
    if code:
        prior = [x for x in S.inc_by_berth_code.get(code, [])
                 if str(x.get("reportedAt") or "") <= str(i.get("reportedAt") or "")]
        seq = len(prior)
    assigned = i.get("assignedTo") or {}
    an = assigned.get("name")
    if an:
        mine = [x for x in S.incidents if (x.get("assignedTo") or {}).get("name") == an]
        closed = sum(1 for x in mine if x.get("status") == "CLOSED")
        assigned = {"name": an, "incidents_assigned": len(mine), "closed": closed,
                    "closed_pct": round(100.0 * closed / len(mine), 1) if mine else None}
    similar = []
    fam_hours = []
    for x in S.incidents:
        if x.get("type") != i.get("type") or x.get("number") == i.get("number"):
            continue
        h = _hours(x.get("reportedAt"), x.get("closedAt") or x.get("resolvedAt"))
        if x.get("status") == "CLOSED" and h is not None:
            fam_hours.append(h)
            if len(similar) < 6:
                similar.append({"incident": x.get("number"), "title": x.get("title"),
                                "berth": S.berth_code(x.get("berth")),
                                "severity": x.get("severity"), "close_hr": h})
    fam_hours.sort()
    median = fam_hours[len(fam_hours) // 2] if fam_hours else None
    return {"incident": inc, "timeline": timeline, "rca": i.get("rca"), "tasks": tasks,
            "comms": comms, "vessel": vessel, "sequence_at_berth": seq,
            "assigned": assigned,
            "similar_cases": {"recent": similar, "family_median_close_hr": median,
                              "family_closed_n": len(fam_hours)},
            "closure_rule": "close-out discipline is tracked by severity (avg_close_days in "
                            "the hse panel); high/critical incidents carry an RCA duty"}


@router.get("/pm/{wo:path}")
def pm_detail(wo: str):
    """Inspection drawer — the path parameter is the inspection number (INS-…)."""
    S = _snap()
    i = S.insp_by_number.get(str(wo))
    if not i:
        raise HTTPException(404, f"Inspection {wo} not found")
    v = S.vessels.get(str(i.get("vessel")), {})
    pc = S.calls_by_id.get(str(i.get("portCall")), {})
    code = S.berth_code(pc.get("berth"))
    term = _term_of(code)
    fnd = i.get("findings") or []
    insp = {"inspection": i.get("number"), "type": i.get("type"),
            "vessel": v.get("name"), "imo": v.get("imo"), "vessel_type": v.get("type"),
            "agent": v.get("agent"), "vcn": pc.get("vcn"), "berth": code,
            "terminal": term.get("terminal"), "inspector": i.get("inspector"),
            "planned_at": _iso(i.get("plannedAt")), "started_at": _iso(i.get("startedAt")),
            "closed_at": _iso(i.get("closedAt")), "status": i.get("status"),
            "result": i.get("result"), "detention": bool(i.get("detention")),
            "remarks": i.get("remarks")}
    chk = i.get("checklist") or []
    by_answer = {}
    for c in chk:
        a = c.get("answer") or "—"
        by_answer[a] = by_answer.get(a, 0) + 1
    checklist_summary = {"items": len(chk), "by_answer": by_answer,
                         "flagged": [{"seq": c.get("seq"), "text": c.get("text"),
                                      "category": c.get("category"), "note": c.get("note")}
                                     for c in chk if c.get("answer") == "NO"][:8]}
    findings = [{"deficiency_code": f.get("deficiencyCode"), "description": f.get("description"),
                 "action_code": f.get("actionCode"), "due_date": _iso(f.get("dueDate")),
                 "status": f.get("status"), "closed_at": _iso(f.get("closedAt"))}
                for f in fnd]
    vid = str(i.get("vessel"))
    history = []
    for x in sorted(S.insp_by_vessel.get(vid, []),
                    key=lambda x: str(x.get("plannedAt") or ""), reverse=True)[:40]:
        xf = x.get("findings") or []
        history.append({"inspection": x.get("number"), "type": x.get("type"),
                        "planned_at": _iso(x.get("plannedAt")), "status": x.get("status"),
                        "result": x.get("result"), "detention": bool(x.get("detention")),
                        "findings": len(xf)})
    allf = [f for x in S.insp_by_vessel.get(vid, []) for f in (x.get("findings") or [])]
    closedf = sum(1 for f in allf if f.get("status") == "CLOSED")
    compliance = {"inspections": len(S.insp_by_vessel.get(vid, [])),
                  "findings": len(allf), "findings_closed": closedf,
                  "closure_pct": round(100.0 * closedf / len(allf), 1) if allf else None,
                  "detentions": sum(1 for x in S.insp_by_vessel.get(vid, [])
                                    if x.get("detention"))}
    bench = None
    try:
        from .data import get_store
        bench = get_store().benchmark.get("psc_detention_benchmark_pct")
    except Exception:
        pass
    detention_context = {
        "detention": bool(i.get("detention")),
        "detention_benchmark_pct": bench,
        "note": ("This inspection resulted in a detention — every detention is a case study "
                 "and feeds the port's rate vs the regional MoU norm."
                 if i.get("detention") else
                 "No detention on this inspection; open findings still carry due dates and "
                 "count against the vessel's closure discipline."),
    }
    # did inspection matter for THIS vessel: incidents in the 90 days after each closed one
    closed_insp = [x for x in S.insp_by_vessel.get(vid, [])
                   if x.get("status") == "CLOSED" and x.get("closedAt")]
    after = 0
    for x in closed_insp:
        t0 = _dtp(x.get("closedAt"))
        if not t0:
            continue
        t1 = t0 + dt.timedelta(days=90)
        for inc in S.inc_by_vessel_id.get(vid, []):
            ti = _dtp(inc.get("reportedAt"))
            if ti and t0 <= ti <= t1:
                after += 1
    effect = {"closed_inspections": len(closed_insp),
              "incidents_90d_after_closed": after,
              "open_findings": len(allf) - closedf}
    return {"inspection": insp, "checklist_summary": checklist_summary, "findings": findings,
            "vessel_history": history, "vessel_compliance": compliance,
            "detention_context": detention_context, "inspection_effect": effect}


@router.get("/employee/{code}")
def employee_detail(code: str):
    """Seafarer drawer — the path parameter is the CDC number."""
    S = _snap()
    s = S.seafarers.get(str(code))
    if not s:
        raise HTTPException(404, f"Seafarer {code} not found")
    today = dt.date.today().isoformat()
    soon = (dt.date.today() + dt.timedelta(days=90)).isoformat()
    certs = []
    for c in (s.get("certificates") or []):
        e = str(c.get("expiryDate") or "")[:10]
        certs.append({"cert_type": c.get("certType"), "grade": c.get("grade"),
                      "number": c.get("number"), "issuer": c.get("issuer"),
                      "issue_date": str(c.get("issueDate") or "")[:10] or None,
                      "expiry_date": e or None,
                      "status": ("EXPIRED" if e and e < today else
                                 "EXPIRING" if e and e <= soon else "VALID")})
    service = []
    vessels_served = set()
    for x in (s.get("seaService") or []):
        vessels_served.add(x.get("vesselName"))
        days = None
        f, t = _dtp(x.get("from")), _dtp(x.get("to"))
        if f and t:
            days = (t - f).days
        service.append({"vessel": x.get("vesselName"), "imo": x.get("imo"),
                        "rank": x.get("rank"), "from": str(x.get("from") or "")[:10] or None,
                        "to": str(x.get("to") or "")[:10] or None, "days": days,
                        "verified": bool(x.get("verified"))})
    service.sort(key=lambda r: str(r["from"] or ""), reverse=True)
    cv = S.vessels.get(str(s.get("currentVessel")), {})
    ident = {"cdc_no": s.get("cdcNo"), "indos_no": s.get("indosNo"), "name": s.get("name"),
             "rank": s.get("rank"), "nationality": s.get("nationality"),
             "dob": str(s.get("dob") or "")[:10] or None, "status": s.get("status"),
             "phone": s.get("phone"), "email": s.get("email"),
             "current_vessel": cv.get("name"), "current_vessel_imo": cv.get("imo"),
             "certificates": len(certs),
             "cert_expired": sum(1 for c in certs if c["status"] == "EXPIRED"),
             "cert_expiring": sum(1 for c in certs if c["status"] == "EXPIRING")}
    return {"identity": ident, "certificates": certs, "sea_service": service,
            "vessels_served": sorted(x for x in vessels_served if x),
            "note": "certificate lapses are a crewing-workflow signal for the Crewing "
                    "Manager — renewals, not personal fault, drive most expiries"}


@router.get("/facility/{name:path}")
def facility_detail(name: str):
    """Berth drawer — the path parameter is the berth code (e.g. CT3-1)."""
    S = _snap()
    b = S.berths_by_code.get(str(name))
    if not b:
        raise HTTPException(404, f"Berth '{name}' not found")
    code = str(name)
    term = _term_of(code)
    stats = _berth_stats_12m().get(code, {})
    identity = {"berth": code, "name": b.get("name"), "terminal": term.get("terminal"),
                "terminal_id": term.get("terminal_id"), "zone": term.get("zone"),
                "btype": b.get("berthType"), "status": b.get("status"),
                "loa_max": b.get("loaMax"), "draft_max": b.get("draftMax"),
                "remarks": b.get("remarks")}
    kpis = {"calls_12m": int(stats.get("vessel_calls") or 0),
            "cargo_12m_mt": int(stats.get("cargo_mt") or 0),
            "teu_12m": int(stats.get("teu") or 0),
            "avg_turnaround_hr": stats.get("avg_turnaround_hr"),
            "avg_waiting_hr": stats.get("avg_waiting_hr"),
            "occupancy_pct": stats.get("occupancy_pct"),
            "berthed_lt6h_pct": stats.get("berthed_lt6h_pct"),
            "incidents_12m": int(stats.get("incidents_total") or 0),
            "high_critical_12m": int(stats.get("incidents_high_critical") or 0),
            "inspections_12m": int(stats.get("inspections_done") or 0),
            "detentions_12m": int(stats.get("detentions") or 0)}
    monthly = []
    try:
        from .data import get_store
        st = get_store()
        ops = st.frames.get("ops")
        hse = st.frames.get("hse")
        if ops is not None:
            d = ops[ops.unit_id == code].sort_values("ym")
            incm = {}
            if hse is not None:
                for _, r in hse[hse.unit_id == code].iterrows():
                    incm[str(r.ym)] = int(r.incidents_total)
            for _, r in d.iterrows():
                monthly.append({"ym": str(r.ym), "vessel_calls": int(r.vessel_calls),
                                "cargo_mt": int(r.cargo_mt),
                                "avg_waiting_hr": None if math.isnan(float(r.avg_waiting_hr))
                                else round(float(r.avg_waiting_hr), 1),
                                "incidents": incm.get(str(r.ym), 0)})
    except Exception:
        pass
    bid = str(b.get("_id"))
    per_vessel = {}
    recent_calls = []
    for c in sorted((x for x in S.portcalls if str(x.get("berth")) == bid),
                    key=lambda x: str(x.get("ata") or x.get("eta") or ""), reverse=True):
        v = S.vessels.get(str(c.get("vessel")), {})
        if v.get("name"):
            k = (v.get("name"), v.get("imo"), v.get("type"))
            per_vessel[k] = per_vessel.get(k, 0) + 1
        if len(recent_calls) < 10:
            recent_calls.append({"vcn": c.get("vcn"), "vessel": v.get("name"),
                                 "imo": v.get("imo"), "status": c.get("status"),
                                 "ata": _iso(c.get("ata")), "atd": _iso(c.get("atd")),
                                 "waiting_hr": _hours(c.get("ata"), c.get("atb")),
                                 "cargo_mt": _cargo_mt(c)})
    top_vessels = [{"vessel": k[0], "imo": k[1], "type": k[2], "calls": n}
                   for k, n in sorted(per_vessel.items(), key=lambda kv: -kv[1])[:10]]
    incidents = [{"incident": x.get("number"), "title": x.get("title"),
                  "severity": x.get("severity"), "status": x.get("status"),
                  "reported_at": _iso(x.get("reportedAt"))}
                 for x in sorted(S.inc_by_berth_code.get(code, []),
                                 key=lambda x: str(x.get("reportedAt") or ""),
                                 reverse=True)[:10]]
    return {"identity": identity, "kpis": kpis, "monthly": monthly,
            "top_vessels": top_vessels, "incidents": incidents,
            "recent_calls": recent_calls}


# ================================================================ terminals
def _cl(v):
    if v is None:
        return None
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except Exception:
        return v


@router.get("/districts")
def districts_list(sort: str = "risk"):
    """Terminal league table (trailing 12 months, from the analysis engine)."""
    try:
        from .data import get_store
        s = get_store()
    except Exception:
        return {"terminals": [], "summary": {}}
    hs = s.frames.get("hotspot_ranking")
    ul = s.unit_latest
    trends = s.frames.get("terminal_trends")
    tmap = {}
    if trends is not None:
        tmap = {str(r["terminal"]): r for r in trends.to_dict("records")}
    rows = []
    if hs is not None:
        term_units = ul[ul.level == "terminal"] if len(ul) else None
        S = _snap()
        berth_count = {}
        for code in S.berths_by_code:
            tid = _term_of(code).get("terminal_id")
            if tid:
                berth_count[tid] = berth_count.get(tid, 0) + 1
        for r in hs.to_dict("records"):
            uid = str(r.get("unit_id"))
            uname = str(r.get("unit_name"))
            extra = {}
            if term_units is not None:
                m = term_units[term_units.unit_id == uid]
                if len(m):
                    extra = {"zone": m.iloc[0].zone,
                             "outstanding_cr": _cl(m.iloc[0].get("outstanding_cr")),
                             "collection_pct": _cl(m.iloc[0].get("collection_pct"))}
            tr = tmap.get(uname, {})
            rows.append({"terminal": uid, "name": uname, "zone": extra.get("zone"),
                         "berths": berth_count.get(uid),
                         "calls_12m": _cl(r.get("calls")), "cargo_12m_mt": _cl(r.get("cargo_mt")),
                         "avg_waiting_hr": _cl(r.get("wait")), "occupancy_pct": _cl(r.get("occ")),
                         "incidents_12m": _cl(r.get("incidents")),
                         "high_critical": _cl(r.get("hi")), "injuries": _cl(r.get("injuries")),
                         "detentions": _cl(r.get("dets")), "findings": _cl(r.get("finds")),
                         "incidents_per_100_calls": _cl(r.get("inc_per_100")),
                         "risk_score": _cl(r.get("risk_score")), "jv": bool(r.get("jv")),
                         "trend_calls_per_yr": _cl(tr.get("trend_calls_per_yr")),
                         "volatility": _cl(tr.get("volatility")),
                         "outstanding_cr": extra.get("outstanding_cr"),
                         "collection_pct": extra.get("collection_pct")})
    key = {"risk": lambda r: -(r["risk_score"] or 0),
           "calls": lambda r: -(r["calls_12m"] or 0),
           "cargo": lambda r: -(r["cargo_12m_mt"] or 0),
           "wait": lambda r: -(r["avg_waiting_hr"] or 0),
           "incidents": lambda r: -(r["incidents_12m"] or 0),
           "outstanding": lambda r: -(r["outstanding_cr"] or 0),
           "terminal": lambda r: r["name"]}.get(sort, lambda r: -(r["risk_score"] or 0))
    rows.sort(key=key)
    tot_inc = sum(r["incidents_12m"] or 0 for r in rows)
    top3 = sum(r["incidents_12m"] or 0
               for r in sorted(rows, key=lambda r: -(r["incidents_12m"] or 0))[:3])
    waits = [r["avg_waiting_hr"] for r in rows if r["avg_waiting_hr"] is not None]
    summary = {"terminals": len(rows), "berths": sum(r["berths"] or 0 for r in rows),
               "calls_12m": int(sum(r["calls_12m"] or 0 for r in rows)),
               "incidents_12m": int(tot_inc),
               "avg_waiting_hr": round(sum(waits) / len(waits), 1) if waits else None,
               "top3_incident_share_pct": round(100.0 * top3 / tot_inc, 1) if tot_inc else None}
    return {"terminals": rows, "summary": summary}


@router.get("/district/{name:path}")
def district_detail(name: str):
    """Terminal drawer — the path parameter is the terminal unit id or name."""
    data = districts_list(sort="risk")
    rows = data["terminals"]
    row = next((r for r in rows if r["terminal"].upper() == name.upper()
                or (r["name"] or "").upper() == name.upper()), None)
    if not row:
        raise HTTPException(404, f"Terminal '{name}' not found")
    total = len(rows)

    def _rank(key):
        ordered = sorted(rows, key=lambda r: -(r[key] or 0))
        for n, r in enumerate(ordered, 1):
            if r["terminal"] == row["terminal"]:
                return n
        return None

    rank = {"risk_rank": _rank("risk_score"), "wait_rank": _rank("avg_waiting_hr"),
            "calls_rank": _rank("calls_12m"), "incidents_rank": _rank("incidents_12m"),
            "total": total}
    tot_cargo = sum(r["cargo_12m_mt"] or 0 for r in rows)
    tot_inc = sum(r["incidents_12m"] or 0 for r in rows)
    waits = [r["avg_waiting_hr"] for r in rows if r["avg_waiting_hr"] is not None]
    port_context = {
        "port_cargo_share_pct": round(100.0 * (row["cargo_12m_mt"] or 0) / tot_cargo, 1)
        if tot_cargo else None,
        "port_incident_share_pct": round(100.0 * (row["incidents_12m"] or 0) / tot_inc, 1)
        if tot_inc else None,
        "avg_terminal_waiting_hr": round(sum(waits) / len(waits), 1) if waits else None,
    }
    berths = []
    monthly = []
    revenue_monthly = []
    try:
        from .data import get_store
        s = get_store()
        ul = s.unit_latest
        bt = ul[(ul.level == "berth") & (ul.terminal == row["terminal"])]
        cols = ["unit_id", "unit_name", "vessel_calls", "cargo_mt", "avg_turnaround_hr",
                "avg_waiting_hr", "occupancy_pct", "incidents_total", "detentions"]
        for _, r in bt.iterrows():
            berths.append({("berth" if c == "unit_id" else c): _cl(r.get(c)) if c not in
                           ("unit_id", "unit_name") else r.get(c)
                           for c in cols})
        ops = s.frames.get("ops")
        hse = s.frames.get("hse")
        rev = s.frames.get("revenue")
        if ops is not None:
            d = ops[ops.unit_id == row["terminal"]].sort_values("ym")
            incm = {}
            if hse is not None:
                for _, r in hse[hse.unit_id == row["terminal"]].iterrows():
                    incm[str(r.ym)] = int(r.incidents_total)
            for _, r in d.iterrows():
                monthly.append({"ym": str(r.ym), "vessel_calls": int(r.vessel_calls),
                                "cargo_mt": int(r.cargo_mt),
                                "avg_waiting_hr": _cl(r.avg_waiting_hr),
                                "incidents": incm.get(str(r.ym), 0)})
        if rev is not None:
            for _, r in rev[rev.unit_id == row["terminal"]].sort_values("ym").iterrows():
                revenue_monthly.append({"ym": str(r.ym), "billed_cr": _cl(r.billed_cr),
                                        "collected_cr": _cl(r.collected_cr),
                                        "outstanding_cr": _cl(r.outstanding_cr)})
    except Exception:
        pass
    worst_waiting = sorted([b for b in berths if b.get("avg_waiting_hr") is not None],
                           key=lambda b: -(b["avg_waiting_hr"] or 0))[:8]
    S = _snap()
    per_vessel, agents, cargo_mix = {}, {}, {}
    incidents_recent = []
    for c in S.portcalls:
        code = S.berth_code(c.get("berth"))
        if _term_of(code).get("terminal_id") != row["terminal"]:
            continue
        v = S.vessels.get(str(c.get("vessel")), {})
        if v.get("name"):
            k = (v.get("name"), v.get("imo"), v.get("type"))
            per_vessel[k] = per_vessel.get(k, 0) + 1
        a = c.get("agentName") or c.get("agentCode")
        if a:
            agents[a] = agents.get(a, 0) + 1
        for x in (c.get("cargoOps") or []):
            ct = x.get("cargoType") or "OTHER"
            cargo_mix[ct] = cargo_mix.get(ct, 0) + float(x.get("qtyMT") or x.get("qty") or 0)
    top_vessels = [{"vessel": k[0], "imo": k[1], "type": k[2], "calls": n}
                   for k, n in sorted(per_vessel.items(), key=lambda kv: -kv[1])[:10]]
    top_agents = [{"agent": a, "calls": n}
                  for a, n in sorted(agents.items(), key=lambda kv: -kv[1])[:8]]
    cargo_mix_rows = [{"cargo_type": t, "qty_mt": round(v)}
                      for t, v in sorted(cargo_mix.items(), key=lambda kv: -kv[1])[:8]]
    for code, incs in S.inc_by_berth_code.items():
        if _term_of(code).get("terminal_id") != row["terminal"]:
            continue
        for x in incs:
            incidents_recent.append({"incident": x.get("number"), "title": x.get("title"),
                                     "severity": x.get("severity"), "status": x.get("status"),
                                     "berth": code, "reported_at": _iso(x.get("reportedAt"))})
    incidents_recent.sort(key=lambda r: str(r["reported_at"] or ""), reverse=True)
    return {"identity": row, "rank": rank, "port_context": port_context,
            "berths": berths, "worst_waiting": worst_waiting, "top_vessels": top_vessels,
            "agents": top_agents, "cargo_mix": cargo_mix_rows, "monthly": monthly,
            "incidents_recent": incidents_recent[:10], "revenue_monthly": revenue_monthly}


# ================================================================ AI briefs
_BRIEF_SYSTEMS = {
    "asset": ("Write a VESSEL BRIEF for one ship, from its record JSON. Cover: what she is "
              "(type, size, agent/operator) and where she works at the port (dominant terminal); "
              "how she behaves across her calls (waiting, turnaround, cargo) vs the port "
              "norms; the inspection record (findings, closure, detentions — a detention is "
              "the serious one); the incident record and the risk_forecast (expected 12-month "
              "incidents with range — say clearly it is a rate-based ESTIMATE on her own "
              "record); certificates and any expiries; if intel/watch_score is present, lead "
              "the recommendation with the watchlist standing. Remember the 8 documented "
              "liner callers carry clean records by design. End with ONE clear recommendation "
              "(routine / targeted inspection / watchlist review)."),
    "ticket": ("Write an INCIDENT BRIEF for one HSE incident from its record JSON. Cover: "
               "what happened and the timeline (reported→acknowledged→closed vs the family "
               "median close time); severity/priority and the injuries/pollution position; "
               "the berth and terminal context (which incident number this is at that "
               "berth); the RCA (root cause, corrective and preventive actions) if present; "
               "the vessel behind it if any; the assigned owner's closure record. End with "
               "the single lesson this incident teaches."),
    "pm": ("Write an INSPECTION BRIEF from its record JSON (PSC/FSI/ISM boarding). Cover: "
           "result and whether a detention was recorded (a detention is the reputational "
           "event — treat it as a case study); the findings raised, their deficiency codes "
           "and closure vs due dates; this vessel's overall inspection compliance (closure "
           "% and detention history); the checklist items flagged NO; whether closed "
           "inspections were followed by incidents (inspection_effect — correlation, not "
           "proof). One recommendation."),
    "employee": ("Write a SEAFARER BRIEF from the record JSON. Cover: rank, status, current "
                 "vessel; the certificate position — expired and expiring certificates are "
                 "the actionable list (frame as a crewing-workflow issue for the Crewing "
                 "Manager, NOT personal fault); sea-service history and currency (verified "
                 "periods, days at sea); the vessels served. End with ONE support "
                 "recommendation for the Crewing Manager."),
    "facility": ("Write a BERTH BRIEF from the record JSON. Cover: the berth's identity "
                 "(terminal, zone, type, LOA/draft limits, status); trailing-12-month "
                 "workload (calls, cargo, TEU) and service (waiting vs the ~5 h major-port "
                 "norm, turnaround, berth-on-arrival %); occupancy vs the 40-70% healthy "
                 "band (below = headroom); the incident record and any detentions; the "
                 "vessels that use it most; the monthly trend. End with the 3 actions that "
                 "most improve this berth."),
    "district": ("Write a TERMINAL INTELLIGENCE BRIEF from the record JSON — this is a whole "
                 "terminal of Port Authority, benchmarked against the other terminals. Use "
                 "`rank` (risk_rank, wait_rank, calls_rank, incidents_rank out of `total`) "
                 "and `port_context` (cargo share, incident share, avg terminal waiting) to "
                 "place the terminal: is it a leader or a laggard, and on which measure. "
                 "Cover: the berths it runs and their waiting tails; traffic and cargo mix "
                 "(name the top vessels and agents); the composite risk_score and what "
                 "drives it (incident intensity dominates the composite); inspections, "
                 "findings and detentions; the receivables position (outstanding_cr, "
                 "collection_pct) and the monthly revenue trajectory; the traffic trend "
                 "(trend_calls_per_yr with volatility as the caveat). Be specific and "
                 "comparative — always relative to the rest of the port. End with the 3 "
                 "actions that would most cut this terminal's risk score and waiting time, "
                 "each with an owner and timeframe."),
}


@router.get("/analysis/{rtype}/{rid:path}")
def record_analysis(rtype: str, rid: str, user=Depends(current_user), lang: str = "en", force: int = 0):
    if rtype not in ("asset", "ticket", "pm", "employee", "facility", "district"):
        raise HTTPException(404, "unknown record type")
    from .data import get_store
    _fresh(get_store())
    key = f"{rtype}|{rid}|{lang}"
    if not force and key in _reports:
        return {"report": _reports[key], "cached": True}
    if not claude_cli.available():
        raise HTTPException(503, "Sagar Drishti intelligence engine is offline")
    data = {"asset": asset_detail, "ticket": ticket_detail, "pm": pm_detail,
            "employee": employee_detail, "facility": facility_detail,
            "district": district_detail}[rtype](rid)
    system = ("You are Sagar Drishti, the port operations analyst (Port Authority AI "
              "Analytics, reference deployment). " + _BRIEF_SYSTEMS[rtype] + " 180-320 words, "
              "markdown, plain confident English, cite exact numbers from the JSON only. "
              "The demo world is fictional; benchmarks come from public major-port "
              "statistics. Never invent dates or amounts."
              + _lang_rule(lang))
    text = claude_cli.complete("RECORD:\n" + json.dumps(data, default=str)[:16000] +
                               "\n\nWrite the brief.", system=system,
                               model=config.AGENT_MODEL, timeout=180)
    with _lock:
        _reports[key] = text
        try:
            json.dump(_reports, open(_cache_path, "w"))
        except Exception:
            pass
    return {"report": text, "cached": False}


# ---------------------------------------------------------------------------
# maritime-named aliases — the report builder (reports.py) resolves record-grain
# packs by these names; the underlying drawers above keep the engine's ids.
# ---------------------------------------------------------------------------
def vessel_detail(imo):
    return asset_detail(imo)


def crew_detail(code):
    return employee_detail(code)


def seafarer_detail(code):
    return employee_detail(code)


def berth_detail(code):
    return facility_detail(code)


def terminal_detail(name):
    return district_detail(name)
