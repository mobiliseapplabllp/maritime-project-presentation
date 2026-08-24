"""
Per-finding detailed report content — powers the click-through drill-down.

Each entry explains, for one finding: what it means in depth, the exact data
source, how the analysis was computed, what the AI/ML vs rule-based contribution
is (stated honestly), and what it implies / predicts for the port.

Sources are referenced by their real file paths so the report is auditable.
"""

# Reusable source strings
_SNAP = ("Mundra Port Operations Portal demo snapshot (portal/frontend/src/demo/"
         "snapshot.json — a deterministic fictional world, Jan 2023 to date), parsed "
         "into the ops / marine / hse / revenue unit×month panels by "
         "data/mundra/build_panels.py.")
_BENCH = ("Benchmark yardsticks (analysis/out_mundra/benchmark.csv) are compiled from "
          "public Indian major-port statistics and the Indian Ocean MoU annual report — "
          "turnaround, pre-berthing wait, occupancy band, berth-day output, PSC "
          "detention rate, collection target.")
_ENGINE = "analysis/analyze_mundra.py (the automated analysis engine)."

DETAILS = {
    "A1": {
        "what": "Average vessel turnaround (anchorage arrival → sailing) moved from about 57 h "
                "in 2023 to about 55 h over the trailing 12 months while monthly vessel calls "
                "grew roughly a third (22.5 → 30.2 calls/month). Handling more traffic at the "
                "same or better service time means throughput scaled without eroding vessel "
                "service — the core operational health signal for a port.",
        "source": f"{_SNAP} {_BENCH}",
        "method": "Mean of monthly avg_turnaround_hr at port level for calendar 2023 vs the "
                  "trailing 12 complete months, alongside mean monthly vessel_calls for the "
                  "same windows; compared against the major-port average turnaround.",
        "ai_role": "Automated trend extraction over the ops panel; the 'scaled without eroding "
                   "service' read is the analyst layer. A transparent calculation, not a "
                   "black-box prediction.",
        "implication": "Growth is not yet buying congestion. Watch the pairing monthly: if calls "
                       "keep climbing and turnaround starts rising with them, berth-window "
                       "planning is the first lever to pull.",
    },
    "A2": {
        "what": "About one call in five waits more than 24 hours at anchorage before a berth. "
                "The tail is not uniform — it concentrates at a few terminals (Ro-Ro, Liquid "
                "Berths, MICT, AMCT in the latest month) where cargo mix meets berth "
                "compatibility limits. Against the public major-port pre-berthing norm of "
                "about 5 h, this is the port's clearest service gap.",
        "source": f"{_SNAP} {_BENCH}",
        "method": "Share of calls with calls_waited_gt24h over total vessel_calls, port level, "
                  "full period; latest-month worst terminals ranked by avg_waiting_hr with "
                  "their >24 h call counts.",
        "ai_role": "Automated threshold count and ranking; the diagnosis that scheduling (not "
                   "dredging or capex) is the first lever is the analyst layer.",
        "implication": "Berth-window planning at the named terminals is the cheapest waiting-time "
                       "fix. Predicts continued >24 h tails at those terminals if allocation "
                       "rules stay unchanged.",
    },
    "A3": {
        "what": "The share of vessels berthed within six hours of arrival — the berth-on-arrival "
                "service level agents quote to lines — sits at 9.7% in the latest month "
                "(14.5% trailing 12 months). It is the customer-facing number, and lifting it "
                "is mostly scheduling discipline rather than infrastructure.",
        "source": f"{_SNAP}",
        "method": "berthed_lt6h_pct at port level: latest complete month and the trailing "
                  "12-month mean.",
        "ai_role": "Automated KPI extraction; the 'scheduling discipline' framing is analyst "
                   "guidance.",
        "implication": "A commercial lever: each point of berth-on-arrival improvement is a "
                       "marketing argument to lines choosing between west-coast ports.",
    },
    "B1": {
        "what": "One composite risk number per terminal over the trailing 12 months — incident "
                "intensity, congestion and compliance blended into a 0–100 score that drives "
                "the 3D twin's colouring and the ranking list. Single Point Moorings leads "
                "(84.2), then CT-4 (75.3), Multipurpose (51.4), AMCT (51.2) and CT-3 (50.2).",
        "source": f"{_SNAP} Computed into analysis/out_mundra/hotspot_ranking.csv by {_ENGINE}",
        "method": "risk_score = 35·norm(incidents per 100 calls) + 25·norm(avg waiting hr) + "
                  "25·norm(high/critical incidents) + 15·norm(detentions), each min-max "
                  "normalised across terminals over the trailing 12 months.",
        "ai_role": "A rule-based composite with declared weights — deliberately transparent so "
                   "leadership can contest the weighting; no hidden model.",
        "implication": "The attention list for HSE walk-downs, berth-window review and PSC "
                       "preparation. SPM's lead is structural (low call count, high-consequence "
                       "liquid operations) — treat its score as a standing watch item.",
    },
    "B2": {
        "what": "The busiest terminal and the riskiest terminal are different lists — volume "
                "alone would misdirect attention. SPM happens to top both cargo tonnage (as "
                "the crude intake point) and risk, but the rest of the volume league diverges "
                "sharply from the risk league.",
        "source": f"{_SNAP} hotspot_ranking.csv from {_ENGINE}",
        "method": "Compare the terminal ranked #1 by trailing-12-month cargo_mt with the "
                  "terminal ranked #1 by risk_score, and the two orderings overall.",
        "ai_role": "Automated cross-ranking comparison.",
        "implication": "Resource allocation (inspectors, tug standby, HSE cover) should follow "
                       "the risk list, not the tonnage list.",
    },
    "C1": {
        "what": "75 incidents in the trailing 12 months, 20 high/critical, 8 injuries — and "
                "only 0.6 near-misses reported per high-severity event. A healthy safety "
                "culture reports several near-misses per serious event (the Heinrich ratio); "
                "a low ratio usually means near-misses go unreported, not that they don't "
                "happen.",
        "source": f"{_SNAP} (hse panel: incidents_total, incidents_high_critical, injuries, "
                  "near_miss).",
        "method": "Trailing-12-month sums at port level; near_miss ÷ incidents_high_critical.",
        "ai_role": "Automated ratio computation; the under-reporting interpretation follows "
                   "standard HSE practice and is the analyst layer.",
        "implication": "Track the near-miss ratio monthly: a falling ratio with steady severity "
                       "means the reporting culture is weakening — commission a no-blame "
                       "near-miss drive before the injury numbers say it for you.",
    },
    "C2": {
        "what": "Oil-sheen / spill events by year: 10 (2023), 14 (2024), 7 (2025), 3 (2026 to "
                "date). Tier-1 sheen events cluster around bunkering and hose work at the "
                "liquid berths; each carries a GPCB (Gujarat Pollution Control Board) "
                "notification duty.",
        "source": f"{_SNAP} (hse panel: spills, per calendar year, port level).",
        "method": "Annual sum of the spills column at port level.",
        "ai_role": "Automated annual aggregation; the bunkering/hose-work clustering context is "
                   "the analyst layer.",
        "implication": "The trend line, not any single event, is the regulator conversation. "
                       "Keep the downward slope by holding the pre-transfer checklist "
                       "discipline at LQB and SPM.",
    },
    "C3": {
        "what": "Equipment-failure incidents (cranes, gangways, conveyors) by year: 21, 17, 19, "
                "3 — the largest single incident class in the register. Maintenance planning "
                "and HSE are the same conversation here.",
        "source": f"{_SNAP} (hse panel: equipment_failures, per calendar year).",
        "method": "Annual sum of the equipment_failures column at port level.",
        "ai_role": "Automated aggregation; the maintenance-planning link is analyst guidance.",
        "implication": "Put the equipment-failure list on the terminal maintenance review "
                       "agenda — reliability spend at the worst berths buys incident count "
                       "down directly.",
    },
    "D1": {
        "what": "Where next year's traffic pressure lands if current trends hold: CT-4, CT-3, "
                "AMCT and West Basin Coal are the fastest-growing terminals by fitted call "
                "trend; MICT is flat and Liquid Berths / AMCT-2 are softening.",
        "source": f"{_SNAP} Computed into analysis/out_mundra/terminal_trends.csv by {_ENGINE}",
        "method": "Ordinary-least-squares slope of monthly vessel calls per terminal over the "
                  "full series (trend_calls_per_yr), with a volatility measure (std dev of "
                  "month-over-month changes) as the reliability caveat.",
        "ai_role": "This is the statistical-forecast component — a per-terminal linear trend "
                   "model projecting direction. The slopes are quantitative; reading them as "
                   "next year's berth-window and manning plan is the analyst layer.",
        "implication": "Build the berth-window and manning plan against these slopes, not last "
                       "year's average. High-volatility terminals deserve wider planning "
                       "buffers.",
    },
    "D2": {
        "what": "Every terminal sits below the UNCTAD 40–70% healthy berth-occupancy band "
                "(highest latest: Multipurpose 13.4%). The port can absorb its own growth "
                "trend for years before berth capacity binds — marketing, not construction, "
                "is the growth constraint.",
        "source": f"{_SNAP} occupancy_pct per terminal, latest month. Band: UNCTAD port "
                  "management guidance (40–70%).",
        "method": "Latest-month occupancy_pct per terminal compared against the healthy band.",
        "ai_role": "Automated comparison against a published planning band.",
        "implication": "Capex requests premised on congestion are not supported by the data; "
                       "commercial development is. Occupancy this low also flatters waiting "
                       "time — the A2 waits are allocation friction, not capacity shortage.",
    },
    "E1": {
        "what": "What actually moves with terminal risk: across terminals the composite "
                "correlates strongly with high-severity incident count (0.84) and incident "
                "rate per 100 calls (0.79), and only weakly with raw call volume (0.08), "
                "waiting (0.04) or occupancy (0.14).",
        "source": f"{_SNAP} hotspot_ranking.csv feature matrix from {_ENGINE}",
        "method": "Pearson correlation of risk_score against calls, wait, occupancy, incident "
                  "rate and high-severity count across terminals.",
        "ai_role": "Automated statistical correlation analysis.",
        "implication": "Risk is an incident story, not a volume story — prevention effort at "
                       "the incident-intense terminals moves the composite; chasing tonnage "
                       "does not.",
    },
    "E2": {
        "what": "An unsupervised machine-learning segmentation: k-means (3 clusters) on "
                "standardised terminal features groups the port into high-volume container "
                "quays (MPT, AMCT, CT-3, MICT), a steady coal-bulk berth (West Basin), and a "
                "low-frequency / high-consequence liquid-and-offshore group (SPM, CT-4, "
                "Liquid Berths, Ro-Ro, AMCT-2) — segments no hand-written rule specified.",
        "source": f"{_SNAP} Terminal feature matrix (calls, turnaround, wait, incident rate, "
                  f"occupancy) from {_ENGINE}",
        "method": "StandardScaler normalisation, then scikit-learn KMeans with k=3; cluster "
                  "profiles are the per-cluster means.",
        "ai_role": "This IS the machine-learning component of the engine — genuine unsupervised "
                   "clustering discovering terminal segments from the data.",
        "implication": "Each cluster needs a different operating playbook — container-quay "
                       "scheduling discipline, bulk-stream maintenance, and rigorous "
                       "permit-to-work culture for the liquid group — instead of one "
                       "port-wide standard.",
    },
    "F1": {
        "what": "The credibility yardstick against Indian major-port averages: berth-day "
                "output runs ~3× the major-port average (56,939 vs 16,500 MT/berth-day — "
                "mechanised terminals), turnaround is competitive (55.0 vs 50.4 h), and the "
                "PSC detention rate (9.5%) sits above the Indian Ocean MoU 2023 norm of "
                "5.6% — the one number to watch, not celebrate.",
        "source": f"{_SNAP} {_BENCH}",
        "method": "Trailing-12-month port-level metrics vs the published benchmark values in "
                  "benchmark.csv.",
        "ai_role": "Automated cross-source comparison; picking detention rate as the watch "
                   "item is the analyst layer.",
        "implication": "The output and turnaround story sells itself; the detention rate is the "
                       "reputational risk. Pre-arrival document checks and targeted surveyor "
                       "attendance on watchlist vessels are the countermeasures.",
    },
    "G1": {
        "what": "Collections against the 95% commercial target: ₹274.6 Cr billed and "
                "₹265.0 Cr collected in the trailing 12 months, cumulative collection "
                "efficiency 98.7%, outstanding book ₹10.56 Cr. The number the CFO reads "
                "first.",
        "source": f"{_SNAP} (revenue panel: billed_cr, collected_cr, outstanding_cr, "
                  f"collection_pct). Target: {_BENCH}",
        "method": "Trailing-12-month sums of billed/collected at port level; cumulative "
                  "collection_pct and outstanding_cr from the latest month.",
        "ai_role": "Automated KPI extraction vs a declared target.",
        "implication": "Above target overall — the receivable is a concentration problem "
                       "(see G2), not a systemic one. Hold the invoice-to-collection cycle "
                       "while traffic grows.",
    },
    "G2": {
        "what": "Where the outstanding book concentrates by terminal: CT-4 (₹3.2 Cr, 94.6% "
                "collected), AMCT-2 (₹2.7 Cr, 93.3%), Multipurpose (₹2.0 Cr), CT-3 "
                "(₹1.4 Cr), MICT (₹0.8 Cr). Pair with the agent directory for the "
                "collection call list.",
        "source": f"{_SNAP} (revenue panel per terminal, latest month).",
        "method": "Terminals ranked by outstanding_cr with their collection_pct.",
        "ai_role": "Automated ranking.",
        "implication": "Two terminals hold over half the receivable — a focused agent-level "
                       "collection push at CT-4 and AMCT-2 moves the port number fastest.",
    },
}

_PORT_SOURCE = ("Mundra Port Operations Portal demo snapshot — vessel calls, marine services, "
                "inspections, HSE incidents and invoices parsed into the ops/marine/hse/revenue "
                "panels (fictional demo world; benchmarks from public major-port statistics).")


def attach(finding):
    """Return the finding with a `detail` block attached (port-native fallback)."""
    d = DETAILS.get(finding.get("id"))
    if not d:
        ev = finding.get("evidence", {})
        d = {
            "what": finding.get("inference", ""),
            "source": _PORT_SOURCE,
            "method": "Computed in analysis/analyze_mundra.py from the Mundra panels.",
            "ai_role": "Automated statistical/rule-based detection over the port panels; the "
                       "interpretation and recommended action are the analyst layer.",
            "implication": finding.get("inference", ""),
            "evidence": ev,
        }
    out = dict(finding)
    out["detail"] = d
    return out
