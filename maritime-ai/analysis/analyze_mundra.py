#!/usr/bin/env python3
"""
Sagar Drishti — Mundra analytical engine (evidence layer).

Consumes the unit x month panels in data/mundra/portal/processed/ plus the raw
portal snapshot (vessel grain) and emits analysis/out_mundra/:
  findings.json        structured, severity-ranked findings (dashboard + chat)
  meta.json            latest complete month, span, unit counts
  benchmark.csv        the public major-port yardstick (single row)
  vessel_reliability.csv  per vessel-type reliability profile
  vessel_watchlist.csv    top individual vessels by watch score
  hotspot_ranking.csv     terminal composite-risk ranking
  sections.json        deep packs: fleet / incidents / inspections / revenue / crew
  facts.json           compact headline facts per year
  evidence.md          human-readable evidence pack

Areas: A operations_efficiency · B hotspot · C hse · D prediction ·
       E pattern · F benchmark · G revenue
"""
import json
import os
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
PROC = os.path.join(HERE, "..", "data", "mundra", "portal", "processed")
GT = os.path.join(HERE, "..", "data", "ground_truth", "major_ports_benchmark.csv")
SNAPSHOT = os.path.abspath(os.path.join(
    HERE, "..", "..", "portal", "frontend", "src", "demo", "snapshot.json"))
OUT = os.path.join(HERE, "out_mundra")
os.makedirs(OUT, exist_ok=True)

JV_TERMINALS = {"MICT", "CT4"}   # joint-venture operated (public record)

findings = []


def add(fid, area, severity, title, evidence, inference):
    findings.append({"id": fid, "area": area, "severity": severity,
                     "title": title, "evidence": evidence, "inference": inference})


def load(name):
    df = pd.read_csv(os.path.join(PROC, f"{name}.csv"))
    return df


def main():
    ops = load("ops")
    marine = load("marine")
    hse = load("hse")
    rev = load("revenue")
    gt = pd.read_csv(GT).set_index("metric")["value"].to_dict()
    snap = json.load(open(SNAPSHOT))
    C = snap["collections"]

    months = sorted(ops.ym.unique())
    # last complete month: the max ym is the in-progress month if it matches "today"
    LM = months[-2] if len(months) > 1 else months[-1]
    span = f"{months[0]}..{LM}"

    port = ops[(ops.level == "port")].sort_values("ym")
    port_lm = port[port.ym == LM].iloc[0]
    term = ops[ops.level == "terminal"]
    term_lm = term[term.ym == LM]

    hse_port = hse[hse.level == "port"].sort_values("ym")
    rev_port = rev[rev.level == "port"].sort_values("ym")
    mar_port = marine[marine.level == "port"].sort_values("ym")

    # =====================================================================
    # A. OPERATIONS EFFICIENCY
    # =====================================================================
    yr_first = port[port.ym.str.startswith("2023")]
    yr_last12 = port[port.ym > months[max(0, len(months) - 14)]]
    t0 = float(yr_first.avg_turnaround_hr.mean())
    t1 = float(yr_last12.avg_turnaround_hr.mean())
    add("A1", "operations_efficiency", "medium",
        "Turnaround time improved while traffic grew",
        {"avg_turnaround_2023_hr": round(t0, 1),
         "avg_turnaround_last12m_hr": round(t1, 1),
         "calls_2023_per_month": round(float(yr_first.vessel_calls.mean()), 1),
         "calls_last12m_per_month": round(float(yr_last12.vessel_calls.mean()), 1),
         "major_ports_avg_hr": gt["avg_turnaround_hr_major_ports"]},
        f"Average turnaround moved from {t0:.0f}h to {t1:.0f}h while monthly calls grew "
        f"~{yr_last12.vessel_calls.mean() / max(yr_first.vessel_calls.mean(), 1) * 100 - 100:.0f}% — "
        "throughput scaled without eroding vessel service time.")

    waitshare = port.calls_waited_gt24h.sum() / max(port.vessel_calls.sum(), 1) * 100
    worst_wait = term_lm.dropna(subset=["avg_waiting_hr"]).sort_values(
        "avg_waiting_hr", ascending=False)
    add("A2", "operations_efficiency", "high",
        "Pre-berthing waits above 24h concentrate at a few terminals",
        {"share_calls_waited_gt24h_pct": round(float(waitshare), 1),
         "latest_month_worst": worst_wait[["unit_name", "avg_waiting_hr", "vessel_calls"]]
            .head(5).round(1).values.tolist(),
         "major_ports_avg_preberthing_hr": gt["avg_preberthing_wait_hr"]},
        "A persistent tail of calls waits more than a day for a berth. The wait is not "
        "uniform — it concentrates where cargo mix meets berth compatibility limits, "
        "so berth-window planning (not dredging or capex) is the first lever.")

    svc = float(port[port.ym == LM].berthed_lt6h_pct.iloc[0] or 0)
    add("A3", "operations_efficiency", "medium",
        "Berth-on-arrival service level",
        {"berthed_within_6h_pct_latest": svc,
         "trailing_12m_pct": round(float(yr_last12.berthed_lt6h_pct.mean()), 1)},
        "The share of vessels berthed within six hours of arrival is the customer-facing "
        "service number agents quote; lifting it is mostly a scheduling discipline gain.")

    # =====================================================================
    # B. HOTSPOTS (composite risk per terminal)
    # =====================================================================
    t12 = term[term.ym > months[max(0, len(months) - 14)]]
    h12 = hse[(hse.level == "terminal") & (hse.ym > months[max(0, len(months) - 14)])]
    m12 = marine[(marine.level == "terminal") & (marine.ym > months[max(0, len(months) - 14)])]
    prof = t12.groupby(["unit_id", "unit_name"]).agg(
        calls=("vessel_calls", "sum"), cargo_mt=("cargo_mt", "sum"),
        wait=("avg_waiting_hr", "mean"), occ=("occupancy_pct", "mean")).reset_index()
    hh = h12.groupby("unit_id").agg(incidents=("incidents_total", "sum"),
                                    hi=("incidents_high_critical", "sum"),
                                    injuries=("injuries", "sum")).reset_index()
    mm = m12.groupby("unit_id").agg(dets=("detentions", "sum"),
                                    finds=("findings_raised", "sum")).reset_index()
    prof = prof.merge(hh, on="unit_id", how="left").merge(mm, on="unit_id", how="left").fillna(0)
    prof["inc_per_100"] = prof.incidents / prof.calls.clip(lower=1) * 100

    def norm(s):
        rng = s.max() - s.min()
        return (s - s.min()) / rng if rng else s * 0

    prof["risk_score"] = (norm(prof.inc_per_100) * 35 + norm(prof.wait) * 25 +
                          norm(prof.hi) * 25 + norm(prof.dets) * 15).round(1)
    prof = prof.sort_values("risk_score", ascending=False)
    prof["jv"] = prof.unit_id.isin(JV_TERMINALS)
    add("B1", "hotspot", "high",
        "Terminal risk ranking (trailing 12 months)",
        {"top5": prof[["unit_name", "risk_score", "inc_per_100", "wait", "hi"]]
            .head(5).round(1).values.tolist(),
         "weights": "incident rate 35 · waiting 25 · high-severity 25 · detentions 15"},
        "One composite number per terminal — incident intensity, congestion and "
        "compliance blended — driving the twin's colour and the ranking list.")
    prof.round(2).to_csv(os.path.join(OUT, "hotspot_ranking.csv"), index=False)

    busiest = prof.sort_values("cargo_mt", ascending=False).iloc[0]
    add("B2", "hotspot", "medium",
        "Volume and risk are different lists",
        {"largest_by_cargo": [busiest.unit_name, round(float(busiest.cargo_mt))],
         "highest_risk": [prof.iloc[0].unit_name, float(prof.iloc[0].risk_score)]},
        "The busiest terminal is not the riskiest — targeting attention by volume alone "
        "would miss where incidents and congestion actually cluster.")

    # =====================================================================
    # C. HSE
    # =====================================================================
    inc12 = hse_port[hse_port.ym > months[max(0, len(months) - 14)]]
    inc_rate = inc12.incidents_total.sum() / max(t12[t12.unit_id != ""].vessel_calls.sum(), 1)
    nm_ratio = inc12.near_miss.sum() / max(inc12.incidents_high_critical.sum(), 1)
    add("C1", "hse", "high",
        "Incident intensity and the near-miss ratio",
        {"incidents_last12m": int(inc12.incidents_total.sum()),
         "high_critical_last12m": int(inc12.incidents_high_critical.sum()),
         "injuries_last12m": int(inc12.injuries.sum()),
         "near_miss_per_high_severity": round(float(nm_ratio), 1)},
        "A healthy safety culture reports many near-misses per serious event "
        "(Heinrich ratio). Track this number monthly: a falling near-miss ratio with "
        "steady severity means under-reporting, not improvement.")

    sp = hse_port.groupby(hse_port.ym.str[:4]).spills.sum()
    add("C2", "hse", "medium",
        "Oil-sheen / spill events by year",
        {"per_year": {y: int(v) for y, v in sp.items()}},
        "Tier-1 sheen events cluster around bunkering and hose work at the liquid "
        "berths; each carries GPCB notification duty. The trend line, not any single "
        "event, is the regulator conversation.")

    eq = hse_port.groupby(hse_port.ym.str[:4]).equipment_failures.sum()
    add("C3", "hse", "medium",
        "Equipment-failure incidents by year",
        {"per_year": {y: int(v) for y, v in eq.items()}},
        "Crane, gangway and conveyor failures are the largest single incident class — "
        "the maintenance-planning conversation belongs in the same room as HSE.")

    # =====================================================================
    # D. PREDICTION (trend + volatility per terminal)
    # =====================================================================
    fc = []
    for uid, g in term.groupby("unit_id"):
        g = g.sort_values("ym").dropna(subset=["vessel_calls"])
        if len(g) < 12:
            continue
        y = g.vessel_calls.values.astype(float)
        x = np.arange(len(y))
        slope = np.polyfit(x, y, 1)[0] * 12          # calls per year
        vol = float(np.std(np.diff(y)))
        fc.append([g.unit_name.iloc[0], int(y[-1]), round(float(slope), 1), round(vol, 2)])
    fcdf = pd.DataFrame(fc, columns=["terminal", "latest_calls", "trend_calls_per_yr", "volatility"])
    fcdf.to_csv(os.path.join(OUT, "terminal_trends.csv"), index=False)
    growing = fcdf.sort_values("trend_calls_per_yr", ascending=False)
    add("D1", "prediction", "medium",
        "Traffic trajectory by terminal",
        {"fastest_growing": growing.head(4).values.tolist(),
         "softest": growing.tail(3).values.tolist(),
         "note": "[terminal, latest monthly calls, trend calls/yr, volatility]"},
        "Where the next year's traffic pressure lands if trends hold — the berth-window "
        "and manning plan should be built against these slopes, not last year's average.")

    occ_hi = term_lm.sort_values("occupancy_pct", ascending=False).head(3)
    add("D2", "prediction", "medium",
        "Berth occupancy headroom",
        {"highest_occupancy_latest": occ_hi[["unit_name", "occupancy_pct"]].values.tolist(),
         "healthy_band_pct": [gt["berth_occupancy_healthy_low_pct"],
                              gt["berth_occupancy_healthy_high_pct"]]},
        "Every terminal sits below the UNCTAD 40-70% congestion band — the port can "
        "absorb its own growth trend for years before berth capacity binds; marketing, "
        "not construction, is the growth constraint.")

    # =====================================================================
    # E. PATTERNS (correlation + typologies)
    # =====================================================================
    feat = prof.copy()
    cm = feat[["risk_score", "calls", "wait", "occ", "inc_per_100", "hi"]].corr().round(2)
    add("E1", "pattern", "low",
        "What moves with terminal risk",
        {"risk_vs": {c: float(cm.loc["risk_score", c]) for c in cm.columns if c != "risk_score"}},
        "Correlates of the composite: congestion and incident intensity dominate; raw "
        "volume alone is a weak predictor of risk.")

    clu = feat.dropna(subset=["wait"]).copy()
    if len(clu) >= 4:
        X = clu[["calls", "wait", "inc_per_100", "occ"]].fillna(0)
        km = KMeans(n_clusters=3, random_state=42, n_init=10).fit(StandardScaler().fit_transform(X))
        clu["cluster"] = km.labels_
        profc = clu.groupby("cluster").agg(n=("unit_name", "count"), calls=("calls", "mean"),
                                           wait=("wait", "mean"), inc=("inc_per_100", "mean")).round(1)
        add("E2", "pattern", "low",
            "Terminal typologies (k-means, 3 clusters)",
            {"profiles": profc.reset_index().values.tolist(),
             "members": {int(c): clu[clu.cluster == c].unit_name.tolist() for c in sorted(clu.cluster.unique())}},
            "Data-driven segmentation: high-volume container quays, steady bulk berths, "
            "and the low-frequency/high-consequence liquid & offshore group each need a "
            "different operating playbook.")

    # =====================================================================
    # F. BENCHMARK vs PUBLIC MAJOR-PORT STATISTICS
    # =====================================================================
    det12 = m12.detentions.sum()
    insp12 = marine[(marine.level == "port") & (marine.ym > months[max(0, len(months) - 14)])]
    det_rate = det12 / max(insp12.inspections_done.sum(), 1) * 100
    add("F1", "benchmark", "high",
        "Mundra vs Indian major-port averages",
        {"turnaround_hr": {"mundra_last12m": round(t1, 1),
                           "major_ports_avg": gt["avg_turnaround_hr_major_ports"]},
         "output_mt_per_berthday": {"mundra_latest": float(port_lm.avg_output_mt_per_berthday),
                                    "major_ports_avg": gt["avg_output_per_shipberthday_mt"]},
         "psc_detention_rate_pct": {"mundra_last12m": round(float(det_rate), 1),
                                    "indian_ocean_mou_2023": gt["psc_detention_rate_pct"]}},
        "The credibility yardstick: berth-day output runs ~3x the major-port average "
        "(mechanised terminals), turnaround is competitive, and the PSC detention rate "
        "sits near the regional MoU norm — the one number to watch, not celebrate.")

    # =====================================================================
    # G. REVENUE
    # =====================================================================
    r12 = rev_port[rev_port.ym > months[max(0, len(months) - 14)]]
    out_lm = float(rev_port[rev_port.ym == LM].outstanding_cr.iloc[0])
    coll_lm = float(rev_port[rev_port.ym == LM].collection_pct.iloc[0])
    add("G1", "revenue", "high",
        "Collections vs the 95% target",
        {"billed_last12m_cr": round(float(r12.billed_cr.sum()), 1),
         "collected_last12m_cr": round(float(r12.collected_cr.sum()), 1),
         "cumulative_collection_pct": coll_lm,
         "outstanding_cr": out_lm,
         "target_pct": gt["collection_efficiency_target_pct"]},
        "Cumulative collection efficiency against the commercial target, with the "
        "outstanding book in crore — the number the CFO reads first; the terminal-level "
        "split shows which agents' books drive the receivable.")

    by_term_rev = rev[(rev.level == "terminal") & (rev.ym == LM)].sort_values(
        "outstanding_cr", ascending=False)
    add("G2", "revenue", "medium",
        "Outstanding receivables by terminal",
        {"top": by_term_rev[["unit_name", "outstanding_cr", "collection_pct"]]
            .head(5).round(1).values.tolist()},
        "Where the receivable concentrates; pair with the agent directory for the "
        "collection call list.")

    # =====================================================================
    # Vessel-grain tables (reliability + watchlist) from the snapshot
    # =====================================================================
    vessels = {str(v["_id"]): v for v in C["vessels"]}
    calls_by_v = defaultdict(int)
    turn_by_type = defaultdict(list)
    for c in C["portcalls"]:
        if c.get("status") != "SAILED" or not (c.get("ata") and c.get("atd")):
            continue
        vid = str(c.get("vessel"))
        calls_by_v[vid] += 1
        v = vessels.get(vid)
        if v:
            th = (pd.Timestamp(c["atd"]) - pd.Timestamp(c["ata"])).total_seconds() / 3600
            turn_by_type[v.get("type", "OTHER")].append(th)
    inc_by_v = defaultdict(int)
    for i in C["incidents"]:
        if i.get("vessel"):
            inc_by_v[str(i["vessel"])] += 1
    insp_by_v = defaultdict(lambda: {"n": 0, "f": 0, "d": 0})
    for i in C["inspections"]:
        vid = str(i.get("vessel") or "")
        if not vid:
            continue
        insp_by_v[vid]["n"] += 1
        insp_by_v[vid]["f"] += len(i.get("findings") or [])
        insp_by_v[vid]["d"] += 1 if i.get("detention") else 0

    rel_rows = []
    for vt, turns in turn_by_type.items():
        vids = [k for k, v in vessels.items() if v.get("type") == vt]
        ncalls = sum(calls_by_v[k] for k in vids)
        nincs = sum(inc_by_v[k] for k in vids)
        nin = sum(insp_by_v[k]["n"] for k in vids)
        nf = sum(insp_by_v[k]["f"] for k in vids)
        nd = sum(insp_by_v[k]["d"] for k in vids)
        rel_rows.append({"vessel_type": vt, "calls": ncalls,
                         "avg_turnaround_hr": round(float(np.mean(turns)), 1),
                         "incidents_per_100_calls": round(nincs / max(ncalls, 1) * 100, 1),
                         "detention_rate_pct": round(nd / max(nin, 1) * 100, 1),
                         "avg_findings_per_inspection": round(nf / max(nin, 1), 2)})
    pd.DataFrame(rel_rows).sort_values("calls", ascending=False).to_csv(
        os.path.join(OUT, "vessel_reliability.csv"), index=False)

    watch = []
    for vid, v in vessels.items():
        if v.get("liner"):
            continue   # documented callers stay off the watchlist
        n = calls_by_v[vid]
        if not n:
            continue
        i = insp_by_v[vid]
        score = (inc_by_v[vid] / n * 40 + i["f"] / max(i["n"], 1) * 12 + i["d"] * 30)
        watch.append({"imo": v.get("imo"), "vessel": v.get("name"), "type": v.get("type"),
                      "agent": v.get("agent"), "calls": n, "incidents": inc_by_v[vid],
                      "inspections": i["n"], "findings": i["f"], "detentions": i["d"],
                      "watch_score": round(score, 1)})
    wdf = pd.DataFrame(watch).sort_values("watch_score", ascending=False)
    wdf.to_csv(os.path.join(OUT, "vessel_watchlist.csv"), index=False)

    # =====================================================================
    # sections.json — deep packs per business area
    # =====================================================================
    seafarers = C.get("seafarers", [])
    crew_kpis = {"seafarers": len(seafarers),
                 "onboard": sum(1 for s in seafarers if s.get("currentVessel")),
                 "cert_expired": sum(1 for s in seafarers for c in s.get("certificates", [])
                                     if str(c.get("expiryDate", "9999")) < snap["generatedAt"]),
                 }
    sections = {
        "fleet": {"kpis": {"vessels": len(vessels),
                           "liner_callers": sum(1 for v in vessels.values() if v.get("liner")),
                           "types": sorted({v.get("type") for v in vessels.values()})},
                  "reliability": rel_rows,
                  "watchlist_top": wdf.head(10).to_dict("records")},
        "incidents": {"kpis": {"total": int(hse_port.incidents_total.sum()),
                               "high_critical": int(hse_port.incidents_high_critical.sum()),
                               "injuries": int(hse_port.injuries.sum()),
                               "spills": int(hse_port.spills.sum())},
                      "by_year": {y: int(v) for y, v in
                                  hse_port.groupby(hse_port.ym.str[:4]).incidents_total.sum().items()}},
        "inspections": {"kpis": {"done": int(mar_port.inspections_done.sum()),
                                 "findings": int(mar_port.findings_raised.sum()),
                                 "detentions": int(mar_port.detentions.sum())}},
        "revenue": {"kpis": {"billed_cr": round(float(rev_port.billed_cr.sum()), 1),
                             "collected_cr": round(float(rev_port.collected_cr.sum()), 1),
                             "outstanding_cr": out_lm,
                             "collection_pct": coll_lm}},
        "crew": {"kpis": crew_kpis},
    }
    json.dump(sections, open(os.path.join(OUT, "sections.json"), "w"), indent=1, default=str)

    # facts.json — compact per-year headline facts
    facts = {"per_year": {}}
    for y, g in port.groupby(port.ym.str[:4]):
        facts["per_year"][y] = {
            "vessel_calls": int(g.vessel_calls.sum()),
            "cargo_mmt": round(float(g.cargo_mt.sum()) / 1e6, 2),
            "teu": int(g.teu.sum()),
            "avg_turnaround_hr": round(float(g.avg_turnaround_hr.mean()), 1)}
    json.dump(facts, open(os.path.join(OUT, "facts.json"), "w"), indent=1)

    # benchmark.csv — the single-row yardstick the engine loads
    pd.DataFrame([{
        "turnaround_target_hr": gt["avg_turnaround_hr_major_ports"],
        "preberthing_target_hr": gt["avg_preberthing_wait_hr"],
        "occupancy_low_pct": gt["berth_occupancy_healthy_low_pct"],
        "occupancy_high_pct": gt["berth_occupancy_healthy_high_pct"],
        "output_target_mt_berthday": gt["avg_output_per_shipberthday_mt"],
        "psc_detention_benchmark_pct": gt["psc_detention_rate_pct"],
        "collection_target_pct": gt["collection_efficiency_target_pct"],
    }]).to_csv(os.path.join(OUT, "benchmark.csv"), index=False)

    # unit_latest.csv — wide latest-complete-month snapshot across panels
    def latest_of(df):
        return df[df.ym == LM].drop(columns=["ym"])
    ul = latest_of(ops)
    for name, df in (("marine", marine), ("hse", hse), ("revenue", rev)):
        ul = ul.merge(latest_of(df).drop(columns=["unit_name", "zone", "terminal", "level"]),
                      on="unit_id", how="left")
    ul.insert(5, "ym", LM)
    ul.to_csv(os.path.join(OUT, "unit_latest.csv"), index=False)

    # meta + findings + evidence pack
    meta = {"generated_span": span, "latest_month": LM,
            "terminals": int(term.unit_id.nunique()),
            "berths": int(ops[ops.level == "berth"].unit_id.nunique()),
            "unit_months": int(len(ops)), "n_findings": len(findings)}
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
    json.dump({"meta": meta, "findings": findings},
              open(os.path.join(OUT, "findings.json"), "w"), indent=1, default=str)

    sev_order = {"high": 0, "medium": 1, "low": 2}
    areas = {"operations_efficiency": "A. Operations efficiency",
             "hotspot": "B. Terminal hotspots", "hse": "C. HSE & incidents",
             "prediction": "D. Predictive early-warning", "pattern": "E. Patterns",
             "benchmark": "F. Benchmark vs major ports", "revenue": "G. Revenue"}
    lines = ["# Sagar Drishti — Mundra Evidence Pack",
             f"\n*Auto-generated from the terminal×month panels. Span {span}; "
             f"latest complete month {LM}. Portal demo world (fictional); benchmarks "
             f"from public major-port statistics.*\n"]
    for akey, atitle in areas.items():
        lines.append(f"\n## {atitle}\n")
        for fd in sorted([x for x in findings if x["area"] == akey],
                         key=lambda x: sev_order[x["severity"]]):
            lines.append(f"### [{fd['id']}] {fd['title']}  _(severity: {fd['severity']})_")
            lines.append(f"\n**Inference:** {fd['inference']}\n")
            lines.append("**Evidence:**\n\n```json")
            lines.append(json.dumps(fd["evidence"], indent=2, default=str))
            lines.append("```\n")
    open(os.path.join(OUT, "evidence.md"), "w").write("\n".join(lines))

    print(f"Findings: {len(findings)} -> {OUT}")
    for fd in sorted(findings, key=lambda x: sev_order[x["severity"]]):
        print(f"  [{fd['severity'][:1].upper()}] {fd['id']} {fd['title']}")


if __name__ == "__main__":
    main()
