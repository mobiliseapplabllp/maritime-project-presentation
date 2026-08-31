# Sagar Drishti — domain contract (single source of truth for the re-domain)

**Product**: Sagar Drishti — Mundra Port AI Analytics ("ocean vision").
Forked from the Sodexo HTM AI engine (itself from POSHAN Drishti). Same engine,
new domain. This file defines every name the code must agree on.

## World

The dataset is the Mundra Port Operations Portal's deterministic demo world
(`../portal/frontend/src/demo/snapshot.json`), Jan 2023 → today. All
transactions fictional; benchmarks come from public major-port statistics.
The 8 documented liner callers never appear on watchlists or negative lists.

## Hierarchy (was state → zone → district → facility)

| level    | was      | units                                             | home |
|----------|----------|---------------------------------------------------|------|
| port     | state    | INMUN "Mundra Port"                               | INMUN|
| zone     | zone     | Container · Dry Bulk & General · Liquid & Offshore| —    |
| terminal | district | MICT, AMCT, AMC2, CT3, CT4, WBC, MPT, RRT, LQB, SPM| —   |
| berth    | facility | 24 berth codes (MICT-1 … SPM-2)                   | —    |

Spine columns in every panel: `level, unit_id, unit_name, zone, terminal, ym`
(the old `district` column is now `terminal`). RBAC scope strings:
`port` | `zone:Container` | `terminal:MICT` | `berth:CT3-1`.
Drill order: port → zone → terminal → berth.

## Panels — `data/mundra/portal/processed/` (was ops/maintenance/penalty/assets)

- `ops.csv` — vessel_calls, cargo_mt, teu, avg_turnaround_hr, avg_waiting_hr,
  calls_waited_gt24h, berthed_lt6h_pct, avg_output_mt_per_berthday, occupancy_pct
- `marine.csv` (was maintenance) — pilotage_moves, tug_jobs, water_supplied_mt,
  garbage_calls, inspections_done, findings_raised, findings_closed, detentions
- `hse.csv` (was penalty) — incidents_total, incidents_high_critical, injuries,
  spills, near_miss, security_events, equipment_failures, avg_close_days
- `revenue.csv` (was assets) — invoices_issued, billed_cr, collected_cr,
  outstanding_cr, collection_pct

## Analysis artifacts — `analysis/out_mundra/` (was out_htm)

| new | was |
|---|---|
| findings.json / meta.json / sections.json / facts.json | same names |
| benchmark.csv (turnaround_target_hr, preberthing_target_hr, occupancy_low_pct, occupancy_high_pct, output_target_mt_berthday, psc_detention_benchmark_pct, collection_target_pct) | benchmark.csv (SLA fields) |
| vessel_reliability.csv (vessel_type, calls, avg_turnaround_hr, incidents_per_100_calls, detention_rate_pct, avg_findings_per_inspection) | device_reliability.csv |
| vessel_watchlist.csv (imo, vessel, type, agent, calls, incidents, inspections, findings, detentions, watch_score) | asset_hotlist.csv |
| hotspot_ranking.csv (unit_id, unit_name, calls, cargo_mt, wait, occ, incidents, hi, injuries, dets, finds, inc_per_100, risk_score, jv) | hotspot_ranking.csv |
| unit_latest.csv (wide merge of all four panels at latest complete month) | unit_latest.csv |
| terminal_trends.csv (terminal, latest_calls, trend_calls_per_yr, volatility) | district_trends |

`sections.json` keys: `fleet, incidents, inspections, revenue, crew`
(was assets/complaints/pm/calibration/employees).
Findings areas: `operations_efficiency, hotspot, hse, prediction, pattern,
benchmark, revenue` (was data_quality/hotspot/service/prediction/pattern/validation).

## Geo — `data/geo_mundra/` (was geo_wb)

`mundra_terminals.geojson` — 11 polygon features, properties
`{unit_id, unit_name, zone}` (SPM contributes two hexagon pads);
`mundra_berths.geojson` — 24 point features `{code, terminal}`. The twin
extrudes terminal polygons coloured by `risk_score` from hotspot_ranking.csv.

## Composite risk (drives twin colour + ranking)

`risk_score = 35·norm(incidents per 100 calls) + 25·norm(avg waiting hr) +
25·norm(high/critical incidents) + 15·norm(detentions)` over trailing 12 months.

## Branding & language

- Product: **Sagar Drishti** · subtitle **Mundra Port AI Analytics**.
- Replace every "POSHAN Drishti", "Sodexo HTM", "HTM AI", "Gujarat WCD/ICDS",
  "WBMSCL/HITES" string. AI personas speak as "Sagar Drishti, the Mundra Port
  operations analyst". Keep EN/हिन्दी/ગુજરાતી i18n (Mundra is in Gujarat).
- Env-var prefix: `SAGAR_*` (was HTM_*/POSHAN_*). Ports stay 8010/5273/8020.
- "district(s)" in UI copy → "terminal(s)"; "facility" → "berth";
  "state" → "port"; "AWC/asset (machine)" → "vessel" where it means the unit
  being tracked; penalties → incidents/receivables per panel mapping.

## Roles & demo accounts (password `Mundra@2026`)

| username | name | designation | scope |
|---|---|---|---|
| harbour.master | Capt. Rajiv Nair | Harbour Master (Port Administrator) | port |
| head.container | Devika Anand | Head — Container Business | zone:Container |
| tm.mict | Nirav Adhia | Terminal Manager — MICT | terminal:MICT |
| hse.chief | Dr. Kavita Raval | Chief — HSE & Environment | port |
| finance | Meenakshi Iyer | Controller — Revenue & Billing | port |
| analyst | Ishaan Trivedi | Data Analyst | port |

Work-order role directory: Harbour Master, Dy. Conservator, Terminal Manager,
Marine Superintendent, HSE Manager, Berth Supervisor, Finance Controller,
Crewing Manager. Names above + portal people (Cdr. Suresh Patel — surveys).

## Agents (workforce names re-skinned, mechanics unchanged)

Collector → **Harbour Collector** (rebuilds panels) · Sentinel → **Berth
Sentinel** (threshold watch) · Auditor → **Marine Auditor** · Planner →
**Berth Planner** · Analyst → **Trade Analyst** · Supervisor → **Duty Officer**.
