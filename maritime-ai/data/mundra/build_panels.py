#!/usr/bin/env python3
"""
Sagar Drishti — Mundra panel builder.

Parses the Mundra Port Operations Portal's deterministic demo snapshot
(portal/frontend/src/demo/snapshot.json — the same fictional world the portal
runs on) into tidy unit x month panels for the analytics engine.

Hierarchy:  port (INMUN) -> zone (3) -> terminal (10) -> berth (24)
Spine cols: level, unit_id, unit_name, zone, terminal, ym

Panels written to portal/processed/:
  ops.csv      vessel_calls, cargo_mt, teu, avg_turnaround_hr, avg_waiting_hr,
               occupancy_pct, berthed_lt6h_pct, avg_output_mt_per_berthday,
               calls_waited_gt24h
  marine.csv   pilotage_moves, tug_jobs, water_supplied_mt, garbage_calls,
               inspections_done, findings_raised, findings_closed, detentions
  hse.csv      incidents_total, incidents_high_critical, injuries, spills,
               near_miss, security_events, equipment_failures, avg_close_days
  revenue.csv  invoices_issued, billed_cr, collected_cr, outstanding_cr,
               collection_pct

All data fictional (portal demo world); benchmarks in ground_truth/ come from
public Indian major-port statistics.
"""
import json
import os
from collections import defaultdict
from datetime import datetime, timezone

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT = os.path.abspath(os.path.join(
    HERE, "..", "..", "..", "portal", "frontend", "src", "demo", "snapshot.json"))
OUT = os.path.join(HERE, "portal", "processed")
os.makedirs(OUT, exist_ok=True)

# Terminal registry: portal berth-code prefix -> (terminal unit, zone unit)
ZONES = {
    "CONTAINER": "Container",
    "BULKGEN": "Dry Bulk & General",
    "LIQMAR": "Liquid & Offshore",
}
TERMINALS = {
    # prefix: (terminal_id, terminal_name, zone_id)
    "MICT": ("MICT", "MICT (DP World JV)", "CONTAINER"),
    "AMCT": ("AMCT", "Adani Mundra Container Terminal", "CONTAINER"),
    "AMC2": ("AMC2", "AMCT-2", "CONTAINER"),
    "CT3":  ("CT3", "CT-3 (AICT)", "CONTAINER"),
    "CT4":  ("CT4", "CT-4 (ACMT JV)", "CONTAINER"),
    "WB":   ("WBC", "West Basin Coal Terminal", "BULKGEN"),
    "MP":   ("MPT", "Multipurpose Terminal", "BULKGEN"),
    "RR":   ("RRT", "Ro-Ro Terminal", "BULKGEN"),
    "LB":   ("LQB", "Liquid Berths", "LIQMAR"),
    "SPM":  ("SPM", "Single Point Moorings", "LIQMAR"),
}


def term_of(berth_code):
    for pre, t in TERMINALS.items():
        if berth_code.startswith(pre):
            return t
    return None


def ym_of(iso):
    return str(iso)[:7]


def hours(a, b):
    ta = datetime.fromisoformat(str(a).replace("Z", "+00:00"))
    tb = datetime.fromisoformat(str(b).replace("Z", "+00:00"))
    return (tb - ta).total_seconds() / 3600.0


def month_hours(ym):
    y, m = int(ym[:4]), int(ym[5:7])
    nxt = datetime(y + (m == 12), (m % 12) + 1, 1, tzinfo=timezone.utc)
    cur = datetime(y, m, 1, tzinfo=timezone.utc)
    return (nxt - cur).total_seconds() / 3600.0


def main():
    snap = json.load(open(SNAPSHOT))
    C = snap["collections"]
    berths = {str(b["_id"]): b for b in C["berths"]}
    vessels = {str(v["_id"]): v for v in C["vessels"]}

    months = sorted({ym_of(c["atd"]) for c in C["portcalls"]
                     if c.get("status") == "SAILED" and c.get("atd")})

    # ------------------------------------------------------------------ ops
    # berth-month accumulators
    def zero():
        return defaultdict(float)
    ops = defaultdict(zero)          # (berth_id, ym) -> metrics
    marine = defaultdict(zero)
    hse = defaultdict(zero)
    rev = defaultdict(zero)

    calls_by_id = {}
    for c in C["portcalls"]:
        calls_by_id[str(c["_id"])] = c
        if c.get("status") != "SAILED" or not (c.get("ata") and c.get("atb") and c.get("atd")):
            continue
        bid = str(c.get("berth") or "")
        if bid not in berths:
            continue
        ym = ym_of(c["atd"])
        k = (bid, ym)
        turn = hours(c["ata"], c["atd"])
        wait = hours(c["ata"], c["atb"])
        stay = hours(c["atb"], c["atd"])
        ops[k]["vessel_calls"] += 1
        ops[k]["_turn_sum"] += turn
        ops[k]["_wait_sum"] += wait
        ops[k]["_stay_hr"] += stay
        ops[k]["calls_waited_gt24h"] += 1 if wait > 24 else 0
        # berth-on-arrival service level: berthed within 6h of anchorage arrival
        ops[k]["_svc_ok"] += 1 if wait <= 6 else 0
        mt = teu = 0
        for o in c.get("cargoOps", []):
            mt += o.get("qtyMT") or 0
            if o.get("unit") == "TEU":
                teu += o.get("qty") or 0
        ops[k]["cargo_mt"] += mt
        ops[k]["teu"] += teu
        # marine services rendered on the call
        for s in c.get("services", []):
            t = s.get("type")
            q = s.get("qty") or 0
            if t == "PILOTAGE":
                marine[k]["pilotage_moves"] += q
            elif t == "TUGS":
                marine[k]["tug_jobs"] += q
            elif t == "FRESH_WATER":
                marine[k]["water_supplied_mt"] += q
            elif t == "GARBAGE":
                marine[k]["garbage_calls"] += q

    # ------------------------------------------------------------- marine
    for i in C["inspections"]:
        if i.get("status") != "CLOSED" or not i.get("closedAt"):
            continue
        call = calls_by_id.get(str(i.get("portCall") or ""))
        bid = str(call.get("berth") or "") if call else ""
        if bid not in berths:
            continue
        k = (bid, ym_of(i["closedAt"]))
        marine[k]["inspections_done"] += 1
        marine[k]["findings_raised"] += len(i.get("findings") or [])
        marine[k]["findings_closed"] += sum(
            1 for f in (i.get("findings") or []) if f.get("status") == "CLOSED")
        marine[k]["detentions"] += 1 if i.get("detention") else 0

    # ---------------------------------------------------------------- hse
    HIGH = {"HIGH", "CRITICAL"}
    for inc in C["incidents"]:
        bid = str(inc.get("berth") or "")
        if bid not in berths or not inc.get("reportedAt"):
            continue
        k = (bid, ym_of(inc["reportedAt"]))
        hse[k]["incidents_total"] += 1
        hse[k]["incidents_high_critical"] += 1 if inc.get("severity") in HIGH else 0
        hse[k]["injuries"] += inc.get("injuries") or 0
        hse[k]["spills"] += 1 if inc.get("type") == "OIL_SPILL" else 0
        hse[k]["near_miss"] += 1 if inc.get("type") == "NEAR_MISS" else 0
        hse[k]["security_events"] += 1 if inc.get("category") == "SECURITY" else 0
        hse[k]["equipment_failures"] += 1 if inc.get("type") == "EQUIPMENT_FAILURE" else 0
        if inc.get("closedAt"):
            hse[k]["_close_n"] += 1
            hse[k]["_close_days"] += hours(inc["reportedAt"], inc["closedAt"]) / 24.0

    # ------------------------------------------------------------ revenue
    for inv in C["invoices"]:
        call = calls_by_id.get(str(inv.get("portCall") or ""))
        bid = str(call.get("berth") or "") if call else ""
        if bid not in berths:
            continue
        if inv.get("issuedAt"):
            k = (bid, ym_of(inv["issuedAt"]))
            rev[k]["invoices_issued"] += 1
            rev[k]["billed_cr"] += (inv.get("total") or 0) / 1e7
        if inv.get("paidAt"):
            k = (bid, ym_of(inv["paidAt"]))
            rev[k]["collected_cr"] += (inv.get("total") or 0) / 1e7

    # --------------------------------------------------- assemble rows
    def unit_row(level, uid, uname, zone_id, term_id, ym):
        return {"level": level, "unit_id": uid, "unit_name": uname,
                "zone": ZONES.get(zone_id, ""), "terminal": term_id or "", "ym": ym}

    def finalize_ops(m):
        n = m.get("vessel_calls", 0)
        out = {"vessel_calls": int(n),
               "cargo_mt": round(m.get("cargo_mt", 0)),
               "teu": int(m.get("teu", 0)),
               "avg_turnaround_hr": round(m["_turn_sum"] / n, 1) if n else None,
               "avg_waiting_hr": round(m["_wait_sum"] / n, 1) if n else None,
               "calls_waited_gt24h": int(m.get("calls_waited_gt24h", 0)),
               "berthed_lt6h_pct": round(m["_svc_ok"] / n * 100, 1) if n else None,
               "_stay_hr": m.get("_stay_hr", 0.0)}
        berthdays = m.get("_stay_hr", 0) / 24.0
        out["avg_output_mt_per_berthday"] = round(m.get("cargo_mt", 0) / berthdays) if berthdays else None
        return out

    def finalize_marine(m):
        return {c: int(m.get(c, 0)) for c in
                ["pilotage_moves", "tug_jobs", "water_supplied_mt", "garbage_calls",
                 "inspections_done", "findings_raised", "findings_closed", "detentions"]}

    def finalize_hse(m):
        out = {c: int(m.get(c, 0)) for c in
               ["incidents_total", "incidents_high_critical", "injuries", "spills",
                "near_miss", "security_events", "equipment_failures"]}
        out["avg_close_days"] = round(m["_close_days"] / m["_close_n"], 1) if m.get("_close_n") else None
        return out

    def finalize_rev(m):
        out = {"invoices_issued": int(m.get("invoices_issued", 0)),
               "billed_cr": round(m.get("billed_cr", 0), 2),
               "collected_cr": round(m.get("collected_cr", 0), 2)}
        return out

    # roll berth-month raw dicts up the hierarchy by summation, then finalize
    def rollup(source):
        agg = defaultdict(zero)   # (level, uid, uname, zone_id, term_id, ym)
        for (bid, ym), m in source.items():
            b = berths[bid]
            t = term_of(b["code"])
            if not t:
                continue
            tid, tname, zid = t
            keys = [("berth", b["code"], f'{b["code"]} — {b["name"]}', zid, tid),
                    ("terminal", tid, tname, zid, tid),
                    ("zone", zid, ZONES[zid], zid, ""),
                    ("port", "INMUN", "Mundra Port", "", "")]
            for level, uid, uname, kz, kt in keys:
                tgt = agg[(level, uid, uname, kz, kt, ym)]
                for c, v in m.items():
                    tgt[c] += v
        return agg

    LEVEL_ORDER = {"port": 0, "zone": 1, "terminal": 2, "berth": 3}

    def emit(source, finalize, name, occupancy=False):
        rows = []
        for (level, uid, uname, zid, tid, ym), m in rollup(source).items():
            row = unit_row(level, uid, uname, zid, tid, ym)
            row.update(finalize(m))
            if occupancy:
                # occupancy: occupied berth-hours / available berth-hours in month
                nb = {"berth": 1,
                      "terminal": sum(1 for b in berths.values() if term_of(b["code"]) and term_of(b["code"])[0] == uid),
                      "zone": sum(1 for b in berths.values() if term_of(b["code"]) and term_of(b["code"])[2] == uid),
                      "port": len(berths)}[level]
                row["occupancy_pct"] = round(min(100.0, m.get("_stay_hr", 0) / (month_hours(ym) * nb) * 100), 1)
            row.pop("_stay_hr", None)
            rows.append(row)
        df = pd.DataFrame(rows)
        df["_lo"] = df["level"].map(LEVEL_ORDER)
        df = df.sort_values(["ym", "_lo", "unit_id"]).drop(columns="_lo")
        df = df[df.ym.isin(months)]
        df.to_csv(os.path.join(OUT, f"{name}.csv"), index=False)
        return df

    dfo = emit(ops, finalize_ops, "ops", occupancy=True)
    dfm = emit(marine, finalize_marine, "marine")
    dfh = emit(hse, finalize_hse, "hse")

    # revenue: add cumulative outstanding + collection pct at each grain
    rows = []
    agg = rollup(rev)
    series = defaultdict(list)
    for (level, uid, uname, zid, tid, ym), m in agg.items():
        series[(level, uid, uname, zid, tid)].append((ym, m))
    for key, seq in series.items():
        level, uid, uname, zid, tid = key
        cum_b = cum_c = 0.0
        for ym, m in sorted(seq, key=lambda x: x[0]):
            row = unit_row(level, uid, uname, zid, tid, ym)
            row.update(finalize_rev(m))
            cum_b += row["billed_cr"]
            cum_c += row["collected_cr"]
            row["outstanding_cr"] = round(max(0.0, cum_b - cum_c), 2)
            row["collection_pct"] = round(cum_c / cum_b * 100, 1) if cum_b else None
            rows.append(row)
    dfr = pd.DataFrame(rows)
    dfr["_lo"] = dfr["level"].map(LEVEL_ORDER)
    dfr = dfr.sort_values(["ym", "_lo", "unit_id"]).drop(columns="_lo")
    dfr = dfr[dfr.ym.isin(months)]
    dfr.to_csv(os.path.join(OUT, "revenue.csv"), index=False)

    print(f"months {months[0]}..{months[-1]}  ops:{len(dfo)} marine:{len(dfm)} "
          f"hse:{len(dfh)} revenue:{len(dfr)} rows -> {OUT}")


if __name__ == "__main__":
    main()
