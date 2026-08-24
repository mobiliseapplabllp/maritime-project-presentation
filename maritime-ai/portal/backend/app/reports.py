"""AI report renderer — turns any entity (port / zone / terminal / berth /
crew / vessel) into a branded HTML report + PDF, reusing the same AI briefs the
portals use. Powers the dashboard "Download PDF / Email" buttons AND the
scheduled recurring emails.
"""
import datetime as dt
import html as _html
import io
import json
import re
import threading

from . import config, claude_cli
from .chat import lang_rule
from .data import get_store

# ---------------------------------------------------------------------------
# formatters
# ---------------------------------------------------------------------------
def _n(v):
    try:
        return f"{float(v):,.0f}"
    except (TypeError, ValueError):
        return "—"


def _pct(v):
    try:
        return f"{float(v):.1f}%"
    except (TypeError, ValueError):
        return "—"


def _hr(v):
    try:
        return f"{float(v):.1f} h"
    except (TypeError, ValueError):
        return "—"


def _mmt(v):
    try:
        return f"{float(v)/1e6:.2f} MMT"
    except (TypeError, ValueError):
        return "—"


def _cr(v):
    try:
        return f"₹{float(v):,.2f} Cr"
    except (TypeError, ValueError):
        return "—"


# ---------------------------------------------------------------------------
# minimal markdown -> html (headings, bold, italic, lists, paragraphs)
# ---------------------------------------------------------------------------
def _inline(s):
    s = _html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"\*(.+?)\*", r"<i>\1</i>", s)
    s = re.sub(r"`(.+?)`", r'<span style="font-family:monospace">\1</span>', s)
    return s


def md_to_html(md):
    out, in_ul = [], False
    for raw in (md or "").split("\n"):
        t = raw.strip()
        if not t:
            if in_ul:
                out.append("</ul>")
                in_ul = False
            continue
        if t.startswith("### "):
            if in_ul:
                out.append("</ul>"); in_ul = False
            out.append(f'<h3 style="color:#0d4f6e;margin:11px 0 3px;font-size:12.5px">{_inline(t[4:])}</h3>')
        elif t.startswith("## "):
            if in_ul:
                out.append("</ul>"); in_ul = False
            out.append(f'<h2 style="color:#0d4f6e;margin:14px 0 5px;font-size:14.5px">{_inline(t[3:])}</h2>')
        elif t.startswith("# "):
            if in_ul:
                out.append("</ul>"); in_ul = False
            out.append(f'<h2 style="color:#0d4f6e;margin:14px 0 5px;font-size:15px">{_inline(t[2:])}</h2>')
        elif t[:2] in ("- ", "* ") or re.match(r"^\d+\.\s", t):
            if not in_ul:
                out.append('<ul style="margin:4px 0 4px 15px;padding:0">'); in_ul = True
            item = _inline(re.sub(r"^(-|\*|\d+\.)\s+", "", t))
            out.append(f'<li style="margin:2px 0;line-height:1.4">{item}</li>')
        else:
            if in_ul:
                out.append("</ul>"); in_ul = False
            out.append(f'<p style="margin:5px 0;line-height:1.45">{_inline(t)}</p>')
    if in_ul:
        out.append("</ul>")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# AI brief (cached per kind|scope|data_version|lang so a batch run generates once)
# ---------------------------------------------------------------------------
_AI_CACHE, _AI_LOCK = {}, threading.Lock()

_PORT_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst (Mundra Port AI Analytics, Kutch, "
    "Gujarat). Write a PORT EXECUTIVE BRIEF for the Harbour Master and senior leadership from the "
    "DATA (all zones, 10 terminals, 24 berths). Plain confident English; cite exact numbers. Markdown, "
    "450-750 words, sections: ## Headline (3-4 sentences on where the port stands), ## Traffic & cargo "
    "(vessel calls, tonnage, TEU, trend), ## Marine service (turnaround and anchorage waiting vs the "
    "public major-port benchmarks — respect cargo mix), ## HSE (incidents, high/critical, injuries, "
    "spills — name the hotspot terminals), ## Revenue & receivables (billed/collected/outstanding ₹ "
    "crore, collection %), ## Top risks (bullets), ## Recommended actions (numbered, owner + "
    "timeframe). Never invent numbers.")
_ZONE_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst. Write a ZONE BRIEF for the zone head "
    "from the DATA (the terminals in this cargo zone, benchmarked within the zone and against the "
    "port). Plain confident English; cite exact numbers; name the terminals and berths that drive the "
    "numbers. Markdown, 400-650 words, sections: ## Headline, ## Terminal league (traffic, turnaround "
    "& waiting within the zone), ## Congestion & service drivers, ## HSE & inspections, "
    "## Recommended actions (numbered, owner + timeframe). Keep the four panels distinct. Never "
    "invent numbers.")
_TERMINAL_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst. Write a TERMINAL BRIEF for this "
    "terminal's manager from the DATA. Plain confident English; cite exact numbers. Markdown, 300-500 "
    "words, sections: ## Headline, ## Berth performance (calls, turnaround, waiting, occupancy), "
    "## Incidents & inspections, ## Receivables, ## Recommended actions (numbered). Never invent "
    "numbers.")
_BERTH_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst. Write a BERTH BRIEF for the berth "
    "supervisor from the DATA (one berth's calls, service times, incidents). Plain confident English; "
    "cite exact numbers. Markdown, 250-400 words, sections: ## Headline, ## Vessel service, ## Safety "
    "& inspections, ## Recommended actions. Never invent numbers.")
_CREW_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst. Write a CREW/SEAFARER BRIEF for the "
    "Crewing Manager from the DATA (roster, sign-on status, certificates). Plain confident English; "
    "cite exact numbers; context, not blame. Markdown, 250-400 words, sections: ## Headline, "
    "## Roster & certificates, ## Recommended actions. Never invent numbers.")
_VESSEL_SYS = (
    "You are Sagar Drishti, the Mundra Port operations analyst. Write a VESSEL BRIEF from the DATA "
    "(one vessel's calls at Mundra, turnaround history, incidents, PSC inspections and detentions). "
    "Plain confident English; cite exact numbers. Markdown, 250-450 words, sections: ## Headline, "
    "## Call & service history, ## Incidents & PSC record, ## Recommended actions. Never invent "
    "numbers.")

_SYS = {"port": _PORT_SYS, "zone": _ZONE_SYS, "terminal": _TERMINAL_SYS,
        "berth": _BERTH_SYS, "crew": _CREW_SYS, "vessel": _VESSEL_SYS}

# kind aliases accepted from callers (executive == the port-level brief)
_KIND_ALIASES = {"state": "port", "exec": "port", "executive": "port"}


def _data_version():
    try:
        return getattr(get_store(), "data_version", "0")
    except Exception:
        return "0"


def _ai_brief(kind, scope, data, lang="en"):
    key = f"{kind}|{scope}|{lang}|{_data_version()}"
    with _AI_LOCK:
        if key in _AI_CACHE:
            return _AI_CACHE[key]
    if not claude_cli.available():
        return "_The Sagar Drishti engine is offline — brief unavailable._"
    system = _SYS[kind] + lang_rule(lang if lang in ("hi", "gu") else "en")
    prompt = "DATA:\n" + json.dumps(data, default=str)[:22000] + "\n\nWrite the brief now."
    try:
        text = claude_cli.complete(prompt, system=system, model=config.AGENT_MODEL, timeout=220)
    except Exception as e:
        return f"_Brief generation failed ({type(e).__name__})._"
    with _AI_LOCK:
        _AI_CACHE[key] = text
    return text


# ---------------------------------------------------------------------------
# port / zone data packs (from the live store panels)
# ---------------------------------------------------------------------------
def _row_pack(r, cols):
    return {c: r.get(c) for c in cols if c in r.index}


_UNIT_COLS = ["unit_name", "vessel_calls", "cargo_mt", "teu", "avg_turnaround_hr",
              "avg_waiting_hr", "berthed_lt6h_pct", "occupancy_pct", "incidents_total",
              "incidents_high_critical", "detentions", "outstanding_cr", "collection_pct"]


def _port_pack():
    s = get_store()
    ul = s.unit_latest
    port = ul[ul.unit_id == "INMUN"]
    zones = ul[ul.level == "zone"]
    terms = ul[ul.level == "terminal"]
    ops = s.frames.get("ops")
    trend = []
    if ops is not None:
        h = ops[ops.unit_id == "INMUN"].sort_values("ym").tail(12)
        trend = [{"ym": r.ym, "vessel_calls": r.vessel_calls, "cargo_mt": r.cargo_mt,
                  "avg_turnaround_hr": r.avg_turnaround_hr} for _, r in h.iterrows()]
    hot = s.frames.get("hotspot_ranking")
    sec = getattr(s, "sections", {}) or {}
    return {
        "latest_month": s.latest_month,
        "port": _row_pack(port.iloc[0], _UNIT_COLS) if len(port) else {},
        "zones": [_row_pack(r, _UNIT_COLS) for _, r in zones.iterrows()],
        "terminals": [_row_pack(r, _UNIT_COLS) for _, r in terms.iterrows()],
        "trend_12m": trend,
        "major_port_benchmark": s.benchmark,
        "risk_ranking": (hot.head(8).to_dict("records") if hot is not None else []),
        "hse": sec.get("incidents", {}),
        "inspections": sec.get("inspections", {}).get("kpis", {}),
        "revenue": sec.get("revenue", {}).get("kpis", {}),
        "fleet": sec.get("fleet", {}).get("kpis", {}),
        "crew": sec.get("crew", {}).get("kpis", {}),
        "findings_high": [{"id": f["id"], "title": f["title"], "inference": f.get("inference", "")}
                          for f in s.findings if f.get("severity") == "high"][:8],
    }


def _zone_pack(zone):
    s = get_store()
    ul = s.unit_latest
    z = ul[(ul.level == "zone") & ((ul.unit_name == zone) | (ul.unit_id == zone))]
    if not len(z):
        return None
    zname = z.iloc[0].unit_name
    terms = ul[(ul.level == "terminal") & (ul.zone == zname)]
    return {
        "latest_month": s.latest_month,
        "zone": _row_pack(z.iloc[0], _UNIT_COLS),
        "terminals": [_row_pack(r, _UNIT_COLS) for _, r in terms.iterrows()],
        "port_reference": _row_pack(ul[ul.unit_id == "INMUN"].iloc[0], _UNIT_COLS)
                          if len(ul[ul.unit_id == "INMUN"]) else {},
        "major_port_benchmark": s.benchmark,
    }


def _tbl(title, columns, rows):
    return {"title": title, "columns": columns, "rows": rows}


def _terminal_table(rows):
    return _tbl("Terminal league (latest month)",
                ["Terminal", "Calls", "Cargo", "Turnaround", "Wait", "Occ %", "Incidents", "Outstanding"],
                [[t.get("unit_name"), _n(t.get("vessel_calls")), _mmt(t.get("cargo_mt")),
                  _hr(t.get("avg_turnaround_hr")), _hr(t.get("avg_waiting_hr")),
                  _pct(t.get("occupancy_pct")), _n(t.get("incidents_total")),
                  _cr(t.get("outstanding_cr"))] for t in rows])


# ---------------------------------------------------------------------------
# record-grain packs (terminal / berth / crew / vessel) — delegate to records.py
# ---------------------------------------------------------------------------
_RECORD_FNS = {
    "terminal": ("terminal_detail",),
    "berth": ("berth_detail",),
    "crew": ("crew_detail", "seafarer_detail"),
    "vessel": ("vessel_detail",),
}


def _record_detail(kind, scope):
    from . import records
    for fn in _RECORD_FNS[kind]:
        f = getattr(records, fn, None)
        if callable(f):
            return f(scope)
    raise ValueError(f"records layer exposes no detail function for '{kind}'")


def _generic_kpis(d):
    """First few scalar figures from the detail pack's identity/kpis dicts."""
    out = []
    for section in ("identity", "kpis"):
        for k, v in (d.get(section) or {}).items():
            if isinstance(v, (int, float)) and len(out) < 5:
                lbl = k.replace("_", " ").title()
                out.append((lbl, _n(v) if abs(float(v)) >= 10 else str(v), ""))
    return out


def _generic_tables(d, limit=2):
    """Render up to `limit` list-of-dicts sections from the detail pack as tables."""
    tables = []
    for k, v in d.items():
        if len(tables) >= limit:
            break
        if isinstance(v, list) and v and isinstance(v[0], dict) and len(v[0]) <= 8:
            cols = list(v[0].keys())
            rows = [[str(row.get(c, "—"))[:40] for c in cols] for row in v[:10]]
            tables.append(_tbl(k.replace("_", " ").title(), [c.replace("_", " ").title() for c in cols], rows))
    return tables


# ---------------------------------------------------------------------------
# build a report descriptor for any (kind, scope)
# ---------------------------------------------------------------------------
def build_report(kind, scope=None, lang="en"):
    kind = (kind or "").lower()
    kind = _KIND_ALIASES.get(kind, kind)
    lm_store = get_store()
    lm = lm_store.latest_month

    if kind == "zone":
        d = _zone_pack(scope)
        if not d:
            raise ValueError(f"zone '{scope}' not found")
        z = d["zone"]
        title = f"Zone Brief — {z.get('unit_name') or scope}"
        sub = f"{len(d['terminals'])} terminals · latest month {lm}"
        kpis = [("Vessel calls", _n(z.get("vessel_calls")), f"{lm}"),
                ("Cargo", _mmt(z.get("cargo_mt")), f"{_n(z.get('teu'))} TEU"),
                ("Turnaround", _hr(z.get("avg_turnaround_hr")),
                 f"wait {_hr(z.get('avg_waiting_hr'))}"),
                ("HSE incidents", _n(z.get("incidents_total")),
                 f"{_n(z.get('detentions'))} detention(s)"),
                ("Outstanding", _cr(z.get("outstanding_cr")), "receivables")]
        tables = [_terminal_table(d["terminals"])]
    elif kind == "terminal":
        d = _record_detail("terminal", scope)
        title = f"Terminal Brief — {scope}"
        sub = f"Mundra Port · latest month {lm}"
        kpis, tables = _generic_kpis(d), _generic_tables(d)
    elif kind == "berth":
        d = _record_detail("berth", scope)
        title = f"Berth Brief — {scope}"
        sub = f"Mundra Port · latest month {lm}"
        kpis, tables = _generic_kpis(d), _generic_tables(d)
    elif kind == "crew":
        d = _record_detail("crew", scope)
        title = f"Crew Brief — {scope}"
        sub = "Mundra Port crewing"
        kpis, tables = _generic_kpis(d), _generic_tables(d)
    elif kind == "vessel":
        d = _record_detail("vessel", scope)
        title = f"Vessel Brief — {scope}"
        sub = f"Calls at Mundra Port · latest month {lm}"
        kpis, tables = _generic_kpis(d), _generic_tables(d)
    else:  # port / executive
        kind = "port"
        d = _port_pack()
        p = d["port"]
        rev = d.get("revenue", {})
        title = "Port Executive Brief — Mundra"
        sub = f"3 cargo zones · 10 terminals · 24 berths · latest month {lm}"
        kpis = [("Vessel calls", _n(p.get("vessel_calls")), f"{lm}"),
                ("Cargo", _mmt(p.get("cargo_mt")), f"{_n(p.get('teu'))} TEU"),
                ("Turnaround", _hr(p.get("avg_turnaround_hr")),
                 f"majors avg {_hr((d.get('major_port_benchmark') or {}).get('turnaround_target_hr'))}"),
                ("Anchorage wait", _hr(p.get("avg_waiting_hr")),
                 f"occupancy {_pct(p.get('occupancy_pct'))}"),
                ("HSE incidents", _n(p.get("incidents_total")),
                 f"{_n(p.get('detentions'))} detention(s)"),
                ("Outstanding", _cr(rev.get("outstanding_cr", p.get("outstanding_cr"))),
                 f"collection {_pct(rev.get('collection_pct', p.get('collection_pct')))}")]
        tables = [_terminal_table(d["terminals"]),
                  _tbl("Composite risk ranking (trailing 12m)",
                       ["Unit", "Risk", "Inc/100 calls", "Wait", "Detentions"],
                       [[h.get("unit_name"), _n(h.get("risk_score")), h.get("inc_per_100"),
                         _hr(h.get("wait")), _n(h.get("dets"))] for h in d.get("risk_ranking", [])])]

    ai_md = _ai_brief(kind, scope or "port", d, lang)
    return {"kind": kind, "scope": scope, "title": title, "subtitle": sub,
            "kpis": kpis, "tables": tables, "ai_md": ai_md, "ai_html": md_to_html(ai_md),
            "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M")}


# ---------------------------------------------------------------------------
# render HTML (print-friendly; xhtml2pdf-compatible) + PDF
# ---------------------------------------------------------------------------
def render_html(rep, for_email=False):
    kpi_cells = "".join(
        f'<td style="border:1px solid #dfe4e2;padding:8px 10px;vertical-align:top">'
        f'<div style="font-size:9px;color:#5f6763;text-transform:uppercase;letter-spacing:.4px">{_html.escape(str(lbl))}</div>'
        f'<div style="font-size:17px;font-weight:800;color:#12211d">{_html.escape(str(val))}</div>'
        f'<div style="font-size:9.5px;color:#5f6763">{_html.escape(str(note))}</div></td>'
        for (lbl, val, note) in rep["kpis"])
    kpi_html = f'<table style="width:100%;border-collapse:collapse;margin:10px 0 4px"><tr>{kpi_cells}</tr></table>'

    tbl_html = ""
    for tb in rep.get("tables", []):
        if not tb["rows"]:
            continue
        head = "".join(f'<th style="text-align:left;background:#0d4f6e;color:#fff;padding:5px 8px;font-size:10px">{_html.escape(str(c))}</th>' for c in tb["columns"])
        body = "".join(
            "<tr>" + "".join(f'<td style="border-bottom:1px solid #eceeed;padding:4px 8px;font-size:10px">{_html.escape(str(v if v is not None else "—"))}</td>' for v in r) + "</tr>"
            for r in tb["rows"])
        tbl_html += (f'<h3 style="color:#12211d;font-size:12.5px;margin:14px 0 5px">{_html.escape(tb["title"])}</h3>'
                     f'<table style="width:100%;border-collapse:collapse"><tr>{head}</tr>{body}</table>')

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page {{ size: A4; margin: 1.4cm; }}
      body {{ font-family: Helvetica, Arial, sans-serif; color:#12211d; font-size:11px; }}
      a {{ color:#0d4f6e; }}
    </style></head><body>
      <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #0d4f6e;padding-bottom:6px">
        <tr><td style="font-size:15px;font-weight:800;color:#0d4f6e">◈ Sagar Drishti</td>
        <td style="text-align:right;font-size:9.5px;color:#5f6763">Mundra Port AI Analytics<br/>Generated {_html.escape(rep['generated'])}</td></tr>
      </table>
      <h1 style="font-size:19px;margin:12px 0 2px;color:#12211d">{_html.escape(rep['title'])}</h1>
      <div style="color:#5f6763;font-size:11px;margin-bottom:2px">{_html.escape(rep['subtitle'])}</div>
      {kpi_html}
      <div style="margin-top:10px">{rep['ai_html']}</div>
      {tbl_html}
      <div style="margin-top:18px;border-top:1px solid #dfe4e2;padding-top:6px;font-size:8.5px;color:#8a938f">
        Generated by Sagar Drishti from the Mundra Port operations snapshot (deterministic demo world).
        Benchmarks are public major-port statistics. The four panels stay separate: ops · marine services · HSE · revenue.
      </div>
    </body></html>"""


def to_pdf(html):
    from xhtml2pdf import pisa
    buf = io.BytesIO()
    pisa.CreatePDF(html, dest=buf, encoding="utf-8")
    return buf.getvalue()


def report_pdf(kind, scope=None, lang="en"):
    rep = build_report(kind, scope, lang)
    return rep, to_pdf(render_html(rep))
