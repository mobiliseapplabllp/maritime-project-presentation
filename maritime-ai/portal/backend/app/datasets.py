"""
Data Catalogue — every dataset behind Sagar Drishti, with full provenance.

Each entry documents WHERE the data came from (the Port Authority Operations
Portal's deterministic demo snapshot → panel builder → analysis engine), HOW it
was obtained, WHAT it covers, and how it was VALIDATED, and serves a paginated,
searchable preview of the actual rows.

Honesty note carried on every entry: the transactional data is the portal's
FICTIONAL demo world; only the benchmark yardsticks come from public
major-port statistics.
"""
import json
import os
import threading

import pandas as pd

from . import config

_PROC = config.DATA_DIR
_AN = config.ANALYSIS_DIR
_GEO = config.GEO_DIR

# The portal demo snapshot (record-level source of the panels)
SNAPSHOT_PATH = os.environ.get(
    "SAGAR_SNAPSHOT",
    os.path.abspath(os.path.join(config.PROJECT_ROOT, "..", "portal", "frontend",
                                 "src", "demo", "snapshot.json")))

_PORTAL_SRC = {
    "name": "Port Operations Portal — demo snapshot",
    "url": "portal/frontend/src/demo/snapshot.json (deterministic fictional demo world)",
    "access": "Parsed locally from the snapshot JSON — vessels, port calls, inspections, "
              "incidents, invoices, seafarers, berths. No external system is queried.",
}
_ENGINE_SRC = {
    "name": "Sagar Drishti data engine (this portal)",
    "url": "data/mundra/build_panels.py · analysis/analyze_mundra.py",
    "access": "Computed locally from the snapshot-derived panels. Fully reproducible.",
}
_GEO_SRC = {
    "name": "Sagar Drishti geo builder",
    "url": "data/geo_mundra/build_geo.py",
    "access": "Stylised terminal polygons and berth points authored for the 3D twin — "
              "indicative geometry, not survey data.",
}
_PANEL = ("Derived from the port portal demo snapshot — a deterministic FICTIONAL demo "
          "world (Jan 2023 → present) — aggregated to the port → zone → terminal → berth "
          "grain by data/mundra/build_panels.py.")
_VALID = ("Panel totals reconcile back to the snapshot's own dashboard aggregates (vessel "
          "calls, cargo tonnes, TEU, invoice totals). Benchmarks in benchmark.csv come from "
          "public Indian major-port statistics and are the only non-fictional numbers.")

CATALOG = [
    dict(id="ops", group="Operational panels",
         name="Vessel traffic & berth performance (per unit / month)",
         file=os.path.join(_PROC, "ops.csv"), source=_PORTAL_SRC, method=_PANEL,
         desc="Monthly vessel calls, cargo tonnes, TEU, turnaround and anchorage waiting "
              "hours, berth-on-arrival service level, berth-day output and occupancy, at "
              "port / zone / terminal / berth grain. THE core operational panel.",
         coverage="4 levels · 24 berths · Jan 2023 – present", validation=_VALID),
    dict(id="marine", group="Operational panels",
         name="Marine services & inspections (per unit / month)",
         file=os.path.join(_PROC, "marine.csv"), source=_PORTAL_SRC, method=_PANEL,
         desc="Pilotage moves, tug jobs, fresh-water and garbage calls, PSC/FSI/ISM "
              "inspections done, findings raised vs closed, and detentions per unit-month.",
         coverage="4 levels · monthly", validation=_VALID),
    dict(id="hse", group="Operational panels",
         name="HSE incidents (per unit / month)",
         file=os.path.join(_PROC, "hse.csv"), source=_PORTAL_SRC, method=_PANEL,
         desc="Incident counts with high/critical share, injuries, spills, near-misses, "
              "security events, equipment failures and average close days.",
         coverage="4 levels · monthly", validation=_VALID),
    dict(id="revenue", group="Operational panels",
         name="Revenue & collections (per unit / month)",
         file=os.path.join(_PROC, "revenue.csv"), source=_PORTAL_SRC, method=_PANEL,
         desc="Invoices issued, billed vs collected (₹ crore), the outstanding book and "
              "cumulative collection efficiency per unit-month.",
         coverage="4 levels · monthly", validation=_VALID),

    dict(id="findings", group="AI analysis outputs",
         name="Port findings (evidence-backed)",
         file=os.path.join(_AN, "findings.json"), source=_ENGINE_SRC,
         method="analyze_mundra.py — rule-based statistical checks plus trend fits and "
                "k-means segmentation over the port panels (efficiency, hotspots, HSE, "
                "prediction, pattern, benchmark, revenue).",
         desc="The findings shown across the Operations Audit, Benchmark and Early Warning "
              "screens.",
         coverage="Port Authority, full panel period",
         validation="Each finding carries its own evidence block; browse them on the "
                    "Operations Audit tab."),
    dict(id="vessel_reliability", group="AI analysis outputs",
         name="Vessel-type reliability",
         file=os.path.join(_AN, "vessel_reliability.csv"), source=_ENGINE_SRC,
         method="Per vessel type: calls, mean turnaround, incidents per 100 calls, "
                "detention rate and findings per inspection.",
         desc="Which vessel classes carry operational and compliance risk — powers the "
              "fleet section.",
         coverage="5 vessel types", validation="Derived table."),
    dict(id="vessel_watchlist", group="AI analysis outputs",
         name="Vessel watchlist",
         file=os.path.join(_AN, "vessel_watchlist.csv"), source=_ENGINE_SRC,
         method="Composite watch score per vessel from incidents, inspection findings and "
                "detentions across its calls. The 8 documented liner callers are excluded "
                "by design.",
         desc="The per-hull risk register behind the fleet watchlist.",
         coverage="Non-liner callers", validation="Derived table."),
    dict(id="hotspot_ranking", group="AI analysis outputs",
         name="Terminal risk ranking",
         file=os.path.join(_AN, "hotspot_ranking.csv"), source=_ENGINE_SRC,
         method="risk_score = 35·norm(incident rate) + 25·norm(waiting) + 25·norm(high-"
                "severity) + 15·norm(detentions), trailing 12 months.",
         desc="The composite that colours the 3D twin and drives the hotspot list.",
         coverage="10 terminals", validation="Weights declared; inputs auditable in the panels."),
    dict(id="unit_latest", group="AI analysis outputs",
         name="Unit latest snapshot (wide)",
         file=os.path.join(_AN, "unit_latest.csv"), source=_ENGINE_SRC,
         method="Latest-complete-month join of ops + marine + hse + revenue per unit.",
         desc="The wide per-unit table behind the dashboards and the 3D twin.",
         coverage="All units, latest month", validation="Derived table."),
    dict(id="terminal_trends", group="AI analysis outputs",
         name="Terminal traffic trends",
         file=os.path.join(_AN, "terminal_trends.csv"), source=_ENGINE_SRC,
         method="OLS slope of monthly calls per terminal (trend_calls_per_yr) with "
                "volatility (std dev of month-over-month changes).",
         desc="Where next year's traffic pressure lands if trends hold.",
         coverage="10 terminals", validation="Derived table."),
    dict(id="benchmark", group="AI analysis outputs",
         name="Major-port benchmark yardsticks",
         file=os.path.join(_AN, "benchmark.csv"), source=_ENGINE_SRC,
         method="Compiled from public Indian major-port statistics and the Indian Ocean "
                "MoU annual report.",
         desc="Turnaround / pre-berthing / occupancy-band / berth-day-output / detention-"
              "rate / collection targets — the only non-fictional numbers in the platform.",
         coverage="Single-row yardstick", validation="Public sources, cited in the findings."),

    dict(id="geo_terminals", group="Geography & twin",
         name="Terminal polygons (GeoJSON)",
         file=os.path.join(_GEO, "mundra_terminals.geojson"), source=_GEO_SRC,
         method="Stylised polygon per terminal with {unit_id, unit_name, zone} properties "
                "(SPM contributes two hexagon pads).",
         desc="The 11 polygon features the 3D twin extrudes, coloured by risk_score.",
         coverage="11 features", validation="Indicative geometry — not survey data."),
    dict(id="geo_berths", group="Geography & twin",
         name="Berth points (GeoJSON)",
         file=os.path.join(_GEO, "mundra_berths.geojson"), source=_GEO_SRC,
         method="One point per berth with {code, terminal} properties.",
         desc="The 24 berth markers on the twin.",
         coverage="24 features", validation="Indicative geometry — not survey data."),
]

# ---------------------------------------------------------------------------
# Portal demo records — served straight from the snapshot's collections, so the
# catalogue covers the record-level world behind the panels. Loaded lazily and
# flattened to tabular previews; the platform runs fine if the snapshot is
# absent (entries show as missing).
# ---------------------------------------------------------------------------
import io
import csv as _csv


def _snap_collections():
    try:
        return json.load(open(SNAPSHOT_PATH)).get("collections", {})
    except Exception:
        return {}


def _iso(v):
    return str(v)[:10] if v else None


def _flat_vessels(C):
    rows = []
    for v in C.get("vessels", []):
        rows.append({"imo": v.get("imo"), "vessel": v.get("name"), "type": v.get("type"),
                     "flag": v.get("flag"), "built": v.get("built"), "dwt": v.get("dwt"),
                     "grt": v.get("grt"), "loa": v.get("loa"), "agent": v.get("agent"),
                     "operator": v.get("operator"), "class_society": v.get("classSociety"),
                     "liner": bool(v.get("liner")), "status": v.get("status")})
    return pd.DataFrame(rows)


def _flat_portcalls(C):
    vname = {str(v["_id"]): v.get("name") for v in C.get("vessels", [])}
    vimo = {str(v["_id"]): v.get("imo") for v in C.get("vessels", [])}
    bcode = {str(b["_id"]): b.get("code") for b in C.get("berths", [])}
    rows = []
    for c in C.get("portcalls", []):
        cargo = sum(float(x.get("qtyMT") or x.get("qty") or 0) for x in (c.get("cargoOps") or []))
        rows.append({"vcn": c.get("vcn"), "vessel": vname.get(str(c.get("vessel"))),
                     "imo": vimo.get(str(c.get("vessel"))), "agent": c.get("agentName"),
                     "purpose": c.get("purpose"), "status": c.get("status"),
                     "berth": bcode.get(str(c.get("berth"))),
                     "ata": _iso(c.get("ata")), "atb": _iso(c.get("atb")),
                     "atd": _iso(c.get("atd")), "cargo_mt": round(cargo),
                     "prev_port": c.get("prevPort"), "next_port": c.get("nextPort")})
    return pd.DataFrame(rows)


def _flat_inspections(C):
    vname = {str(v["_id"]): v.get("name") for v in C.get("vessels", [])}
    vimo = {str(v["_id"]): v.get("imo") for v in C.get("vessels", [])}
    rows = []
    for i in C.get("inspections", []):
        fnd = i.get("findings") or []
        rows.append({"number": i.get("number"), "type": i.get("type"),
                     "vessel": vname.get(str(i.get("vessel"))),
                     "imo": vimo.get(str(i.get("vessel"))),
                     "inspector": i.get("inspector"), "status": i.get("status"),
                     "result": i.get("result"), "detention": bool(i.get("detention")),
                     "findings": len(fnd),
                     "findings_closed": sum(1 for f in fnd if f.get("status") == "CLOSED"),
                     "planned_at": _iso(i.get("plannedAt")), "closed_at": _iso(i.get("closedAt"))})
    return pd.DataFrame(rows)


def _flat_incidents(C):
    bcode = {str(b["_id"]): b.get("code") for b in C.get("berths", [])}
    rows = []
    for i in C.get("incidents", []):
        rows.append({"number": i.get("number"), "title": i.get("title"),
                     "category": i.get("category"), "type": i.get("type"),
                     "severity": i.get("severity"), "priority": i.get("priority"),
                     "status": i.get("status"), "berth": bcode.get(str(i.get("berth"))),
                     "area": (i.get("location") or {}).get("area"),
                     "vessel": i.get("vesselName") or None,
                     "injuries": i.get("injuries"),
                     "reported_at": _iso(i.get("reportedAt")),
                     "closed_at": _iso(i.get("closedAt"))})
    return pd.DataFrame(rows)


def _flat_invoices(C):
    vname = {str(v["_id"]): v.get("name") for v in C.get("vessels", [])}
    rows = []
    for i in C.get("invoices", []):
        rows.append({"number": i.get("number"), "vessel": vname.get(str(i.get("vessel"))),
                     "bill_to": (i.get("billTo") or {}).get("name"),
                     "subtotal": i.get("subtotal"), "gst_amount": i.get("gstAmount"),
                     "total": i.get("total"), "currency": i.get("currency"),
                     "status": i.get("status"), "issued_at": _iso(i.get("issuedAt")),
                     "paid_at": _iso(i.get("paidAt"))})
    return pd.DataFrame(rows)


def _flat_seafarers(C):
    import datetime as _dt
    today = _dt.date.today().isoformat()
    vname = {str(v["_id"]): v.get("name") for v in C.get("vessels", [])}
    rows = []
    for s in C.get("seafarers", []):
        certs = s.get("certificates") or []
        expired = sum(1 for c in certs if (_iso(c.get("expiryDate")) or "9999") < today)
        rows.append({"cdc_no": s.get("cdcNo"), "name": s.get("name"), "rank": s.get("rank"),
                     "nationality": s.get("nationality"), "status": s.get("status"),
                     "current_vessel": vname.get(str(s.get("currentVessel"))),
                     "certificates": len(certs), "cert_expired": expired})
    return pd.DataFrame(rows)


def _flat_berths(C):
    rows = []
    for b in C.get("berths", []):
        rows.append({"berth": b.get("code"), "name": b.get("name"),
                     "terminal": b.get("terminal"), "berth_type": b.get("berthType"),
                     "loa_max": b.get("loaMax"), "draft_max": b.get("draftMax"),
                     "status": b.get("status")})
    return pd.DataFrame(rows)


_SNAP_BUILDERS = {
    "snap_vessels": ("vessels", _flat_vessels),
    "snap_portcalls": ("portcalls", _flat_portcalls),
    "snap_inspections": ("inspections", _flat_inspections),
    "snap_incidents": ("incidents", _flat_incidents),
    "snap_invoices": ("invoices", _flat_invoices),
    "snap_seafarers": ("seafarers", _flat_seafarers),
    "snap_berths": ("berths", _flat_berths),
}


def _snap(id, name, desc, coverage, searchable):
    return dict(id=id, kind="snapshot", group="Portal demo records", name=name,
                source=_PORTAL_SRC,
                method="Flattened from the snapshot's record collections; ids resolved to "
                       "vessel names, IMO numbers and berth codes.",
                desc=desc, coverage=coverage,
                validation="Fictional demo records — internally consistent with the panels "
                           "built from the same snapshot.",
                searchable=list(searchable), file=SNAPSHOT_PATH)


SNAP_DATASETS = [
    _snap("snap_vessels", "Vessels — fleet register",
          "Every vessel in the demo world: identity, type, dimensions, agent, operator "
          "and liner flag.", "31 vessels",
          ["imo", "vessel", "type", "agent", "operator"]),
    _snap("snap_portcalls", "Port calls",
          "Every vessel call: VCN, agent, purpose, berth, arrival/berthing/sailing "
          "timestamps and cargo tonnes.", "≈1,200 calls · 2023–present",
          ["vcn", "vessel", "imo", "agent", "berth", "status"]),
    _snap("snap_inspections", "Inspections (PSC / FSI / ISM)",
          "Every inspection: type, inspector, result, detention flag and findings "
          "closure.", "77 inspections",
          ["number", "vessel", "imo", "type", "result", "inspector"]),
    _snap("snap_incidents", "HSE incident register",
          "Every incident: category, type, severity, priority, status, berth/area and "
          "close timestamps.", "≈400 incidents",
          ["number", "title", "category", "type", "severity", "berth", "vessel"]),
    _snap("snap_invoices", "Invoices",
          "Every invoice: bill-to party, amounts with GST, status and payment dates.",
          "≈760 invoices", ["number", "vessel", "bill_to", "status"]),
    _snap("snap_seafarers", "Seafarers — crew register",
          "The seafarer register: rank, status, current vessel and certificate counts "
          "with expiries.", "18 seafarers",
          ["cdc_no", "name", "rank", "current_vessel"]),
    _snap("snap_berths", "Berths — static register",
          "The 24 berths: terminal, berth type, LOA/draft limits and status.",
          "24 berths", ["berth", "name", "terminal", "berth_type"]),
]

# research articles live in a local JSON store (see research.py)
RESEARCH_DATASET = dict(
    id="research", kind="research", group="Access & config",
    name="Market Intelligence articles",
    source={"name": "Sagar Drishti research agent",
            "url": "public web via the research agent's daily run",
            "access": "Web-grounded briefings stored locally; sources cited per article."},
    method="Daily internet research: the port/the operator Ports vs Indian major ports, and the "
           "port-operator competitive landscape — each claim source-linked.",
    desc="Dated research briefings powering the two Market Intelligence pages.",
    coverage="daily · 2 topics",
    validation="Every claim carries a source link; verify before external use.",
    searchable=["topic", "title", "body_md"], file="")

CATALOG_ALL = CATALOG + SNAP_DATASETS + [RESEARCH_DATASET]
_BY_ID = {d["id"]: d for d in CATALOG_ALL}
_CACHE = {}
_LOCK = threading.Lock()


def _clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return str(v)
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            return str(v)
    if hasattr(v, "isoformat"):
        return str(v)
    return v


# Any column with one of these names becomes a click-through to that entity's
# portal (or drawer for incident/inspection) — applied uniformly across every
# dataset. The link `type` ids are the record-drawer routes:
#   asset=vessel · district=terminal · facility=berth · employee=seafarer ·
#   ticket=incident (route names kept for URL stability).
# {column: {"type": <RecordLink type>, "id"?: <column that carries the link id>}}
_STD_LINKS = {
    "imo": {"type": "asset"},
    "vessel": {"type": "asset", "id": "imo"},
    "terminal": {"type": "district"},
    "berth": {"type": "facility"},
    "cdc_no": {"type": "employee"},
    "name": {"type": "employee", "id": "cdc_no"},
    "unit_id": {"type": "district"},
}


def _links_for(cols):
    cols = set(cols)
    out = {}
    for c, cfg in _STD_LINKS.items():
        if c in cols and (("id" not in cfg) or (cfg["id"] in cols)):
            out[c] = cfg
    return out


def _csv_cell(v):
    """Neutralise spreadsheet formula injection (CWE-1236): a text cell starting
    with = + - @ executes as a formula when the CSV is opened in Excel. Internet-
    derived text (e.g. research articles) makes this reachable, so prefix a quote.
    Purely numeric strings (e.g. '-5') are left alone."""
    if v is None:
        return ""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@"):
        body = v[1:].replace(",", "").replace(".", "", 1)
        if not (v[:1] in ("-", "+") and body.isdigit()):
            return "'" + v
    return v


def _csv_line(vals):
    buf = io.StringIO()
    _csv.writer(buf).writerow([_csv_cell(v) for v in vals])
    return buf.getvalue()


def export_iter(dataset_id, q="", cap=300000):
    """Yield CSV lines for the (optionally filtered) dataset — streamed, capped."""
    entry = _BY_ID.get(dataset_id)
    if entry is None:
        return
    _, df = get_df(dataset_id)
    if df is None:
        return
    if q:
        ql = str(q).lower()
        df = df[df.apply(lambda r: r.astype(str).str.lower().str.contains(ql, regex=False).any(), axis=1)]
    yield _csv_line([str(c) for c in df.columns])
    for row in df.head(cap).itertuples(index=False, name=None):
        yield _csv_line([_clean(v) for v in row])


def _research_df():
    from . import research
    rows = []
    for t in getattr(research, "TOPICS", ()):
        for a in research.articles(t, limit=60):
            rows.append({"id": a.get("id"), "topic": a.get("topic"), "title": a.get("title"),
                         "created_at": a.get("created_at"),
                         "sources": len(a.get("sources") or []),
                         "body_md": (a.get("body_md") or "")[:4000]})
    return pd.DataFrame(rows)


def _load_df(entry):
    kind = entry.get("kind")
    if kind == "snapshot":
        coll, fn = _SNAP_BUILDERS[entry["id"]]
        C = _snap_collections()
        if not C:
            return None
        return fn(C)
    if kind == "research":
        return _research_df()
    path = entry["file"]
    if path.endswith(".csv"):
        return pd.read_csv(path)
    with open(path) as f:
        doc = json.load(f)
    if entry["id"] == "findings":
        rows = [{"id": x.get("id"), "area": x.get("area"), "severity": x.get("severity"),
                 "title": x.get("title"), "inference": x.get("inference")}
                for x in doc.get("findings", [])]
        return pd.DataFrame(rows)
    if path.endswith(".geojson"):
        rows = [dict(f.get("properties") or {}) for f in doc.get("features", [])]
        return pd.DataFrame(rows)
    recs = doc.get("records", doc if isinstance(doc, list) else [])
    return pd.DataFrame(recs)


def get_df(dataset_id):
    entry = _BY_ID.get(dataset_id)
    if not entry:
        return None, None
    if entry.get("kind") not in ("snapshot", "research") and not os.path.exists(entry["file"]):
        return None, None
    with _LOCK:
        if dataset_id not in _CACHE:
            try:
                _CACHE[dataset_id] = _load_df(entry)
            except Exception:
                return entry, None
        return entry, _CACHE[dataset_id]


_DROP = ("file", "searchable")
_GROUPS = ["Operational panels", "AI analysis outputs", "Portal demo records",
           "Geography & twin", "Access & config"]


def catalog():
    out = []
    for entry in CATALOG_ALL:
        meta = {k: v for k, v in entry.items() if k not in _DROP}
        meta["downloadable"] = True
        if entry.get("kind") in ("snapshot", "research"):
            _, df = get_df(entry["id"])
            if df is not None and (len(df) or entry["kind"] == "research"):
                # a research register with no articles yet is present, just empty
                meta["rows"] = int(len(df))
                meta["cols"] = int(len(df.columns))
                meta["columns"] = [str(c) for c in df.columns][:40]
                meta["storage"] = ("portal demo snapshot" if entry["kind"] == "snapshot"
                                   else "local research store")
            else:
                meta["missing"] = True
        else:
            meta["filename"] = os.path.basename(entry["file"])
            if os.path.exists(entry["file"]):
                meta["size_kb"] = round(os.path.getsize(entry["file"]) / 1024)
                meta["updated"] = pd.Timestamp(os.path.getmtime(entry["file"]), unit="s").strftime("%Y-%m-%d %H:%M")
                _, df = get_df(entry["id"])
                if df is not None:
                    meta["rows"] = int(len(df))
                    meta["cols"] = int(len(df.columns))
                    meta["columns"] = [str(c) for c in df.columns][:40]
            else:
                meta["missing"] = True
        out.append(meta)
    groups = []
    for g in _GROUPS:
        n = sum(1 for d in out if d.get("group") == g and not d.get("missing"))
        rows = sum(d.get("rows", 0) for d in out if d.get("group") == g)
        if n:
            groups.append({"name": g, "datasets": n, "rows": rows})
    return {"datasets": out, "groups": groups,
            "totals": {"datasets": sum(g["datasets"] for g in groups),
                       "rows": sum(g["rows"] for g in groups)}}


def preview(dataset_id, offset=0, limit=50, q=""):
    entry = _BY_ID.get(dataset_id)
    if entry is None:
        return None
    entry, df = get_df(dataset_id)
    if df is None:
        return {"id": dataset_id, "error": "dataset unavailable"}
    view = df
    if q:
        ql = str(q).lower()
        mask = view.apply(lambda r: r.astype(str).str.lower().str.contains(ql, regex=False).any(), axis=1)
        view = view[mask]
    total = int(len(view))
    page = view.iloc[offset:offset + limit]
    cols = [str(c) for c in page.columns]
    rows = [[_clean(v) for v in row] for row in page.itertuples(index=False, name=None)]
    return {"id": dataset_id, "columns": cols, "rows": rows, "links": _links_for(cols),
            "total": total, "offset": offset, "limit": limit}
