"""Guarded read-only SQL access for the chatbot's text-to-SQL loop.

The LLM can request SELECT queries against the analytics store — the in-memory
SQLite mirror of the Mundra panels (ops / marine / hse / revenue) and the
analysis tables (unit_latest, vessel_reliability, vessel_watchlist,
hotspot_ranking, terminal_trends). Hard guards: SELECT-only, forbidden
keywords, row cap. Nothing here can write, and there is no external database
dependency — if the store is unavailable the call degrades to an error dict,
never an exception.
"""
import re

MAX_ROWS = 60

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|"
    r"analyze|comment|do|call|listen|notify|prepare|execute|attach|detach|pragma|"
    r"reindex|replace|lock)\b", re.I)


def run_select(sql, max_rows=MAX_ROWS):
    """Run one SELECT against the analytics SQLite mirror.
    Returns {columns, rows, rowcount, truncated} or {error}."""
    q = (sql or "").strip().rstrip(";").strip()
    low = q.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return {"error": "only SELECT queries are allowed"}
    if _FORBIDDEN.search(low):
        return {"error": "query contains a forbidden keyword"}
    if ";" in q:
        return {"error": "one statement per query"}
    if not re.search(r"\blimit\s+\d+", low):
        q += f" limit {max_rows}"
    try:
        from .data import get_store
        s = get_store()
        if s.conn is None:
            return {"error": "analytics store not loaded"}
        with s._sql_lock:
            cur = s.conn.execute(q)
            cols = [d[0] for d in cur.description] if cur.description else []
            rows = cur.fetchmany(max_rows + 1)
        truncated = len(rows) > max_rows
        rows = rows[:max_rows]
        return {"columns": cols,
                "rows": [[(str(v) if v is not None else None) for v in r] for r in rows],
                "rowcount": len(rows), "truncated": truncated}
    except Exception as e:
        return {"error": str(e).split("\n")[0][:300]}


SCHEMA_DOC = """DATABASE (SQLite analytics mirror, read-only) — the Mundra Port panels and analysis tables. Grain and semantics:

Every panel row is one unit x month. Spine columns in all four panels: level ('port'|'zone'|'terminal'|'berth'), unit_id (INMUN for the port; zone ids CONTAINER/BULKGEN/LIQMAR; terminal ids MICT, AMCT, AMC2, CT3, CT4, WBC, MPT, RRT, LQB, SPM; 24 berth codes like MICT-1, CT3-2, SPM-2), unit_name, zone, terminal, ym 'YYYY-MM' (Jan 2023 - present). ALWAYS filter one level — mixing levels double-counts (the port row already contains every zone/terminal/berth).

ops — vessel traffic & berth performance: vessel_calls, cargo_mt (tonnes), teu, avg_turnaround_hr (anchorage arrival -> sailing), avg_waiting_hr (anchorage wait before berthing), calls_waited_gt24h, berthed_lt6h_pct (berth-on-arrival service level), avg_output_mt_per_berthday, occupancy_pct.
marine — marine services & inspections: pilotage_moves, tug_jobs, water_supplied_mt, garbage_calls, inspections_done (PSC/FSI/ISM), findings_raised, findings_closed, detentions.
hse — safety & environment: incidents_total, incidents_high_critical, injuries, spills, near_miss, security_events, equipment_failures, avg_close_days.
revenue — billing & collections: invoices_issued, billed_cr (₹ crore), collected_cr, outstanding_cr (cumulative billed minus collected), collection_pct.
unit_latest — wide latest-complete-month snapshot per unit, all four panels joined (same spine + all metric columns above). Use this for "right now"/"latest" questions.
vessel_reliability — per vessel TYPE (CONT container, BULK, TANK tanker, GEN general, RORO): calls, avg_turnaround_hr, incidents_per_100_calls, detention_rate_pct, avg_findings_per_inspection.
vessel_watchlist — per-vessel risk register: imo, vessel, type, agent, calls, incidents, inspections, findings, detentions, watch_score (higher = worse). The 8 documented liner callers are excluded by design.
hotspot_ranking — per-terminal composite risk (trailing 12m): unit_id, unit_name, calls, cargo_mt, wait (avg hr), occ (occupancy %), incidents, hi (high/critical), injuries, dets (detentions), finds (findings), inc_per_100, risk_score (0-100: incident rate 35 · waiting 25 · high-severity 25 · detentions 15), jv (joint-venture flag).
terminal_trends — terminal, latest_calls, trend_calls_per_yr (linear fit), volatility.

RULES: SQLite dialect (no ILIKE — use LIKE, it is case-insensitive for ASCII; use strftime/substr on ym text). Money is ₹ crore in *_cr columns. Detentions/inspections live in marine (monthly) and in vessel_watchlist (per vessel). Latest complete month = max(ym) in unit_latest. All transactions are the Mundra portal's fictional demo world; benchmark targets come from public major-port statistics.
JOIN KEYS: unit_id joins the panels to each other and to hotspot_ranking; ym aligns months; vessel_watchlist joins vessel_reliability via type."""
