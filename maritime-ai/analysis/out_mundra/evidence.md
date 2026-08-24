# Sagar Drishti — Mundra Evidence Pack

*Auto-generated from the terminal×month panels. Span 2023-01..2026-07; latest complete month 2026-07. Portal demo world (fictional); benchmarks from public major-port statistics.*


## A. Operations efficiency

### [A2] Pre-berthing waits above 24h concentrate at a few terminals  _(severity: high)_

**Inference:** A persistent tail of calls waits more than a day for a berth. The wait is not uniform — it concentrates where cargo mix meets berth compatibility limits, so berth-window planning (not dredging or capex) is the first lever.

**Evidence:**

```json
{
  "share_calls_waited_gt24h_pct": 20.2,
  "latest_month_worst": [
    [
      "Ro-Ro Terminal",
      23.0,
      1
    ],
    [
      "Liquid Berths",
      21.0,
      2
    ],
    [
      "MICT (DP World JV)",
      20.0,
      2
    ],
    [
      "Adani Mundra Container Terminal",
      20.0,
      2
    ],
    [
      "AMCT-2",
      14.7,
      3
    ]
  ],
  "major_ports_avg_preberthing_hr": 5.0
}
```

### [A1] Turnaround time improved while traffic grew  _(severity: medium)_

**Inference:** Average turnaround moved from 57h to 55h while monthly calls grew ~34% — throughput scaled without eroding vessel service time.

**Evidence:**

```json
{
  "avg_turnaround_2023_hr": 56.9,
  "avg_turnaround_last12m_hr": 55.0,
  "calls_2023_per_month": 22.5,
  "calls_last12m_per_month": 30.2,
  "major_ports_avg_hr": 50.4
}
```

### [A3] Berth-on-arrival service level  _(severity: medium)_

**Inference:** The share of vessels berthed within six hours of arrival is the customer-facing service number agents quote; lifting it is mostly a scheduling discipline gain.

**Evidence:**

```json
{
  "berthed_within_6h_pct_latest": 9.7,
  "trailing_12m_pct": 14.5
}
```


## B. Terminal hotspots

### [B1] Terminal risk ranking (trailing 12 months)  _(severity: high)_

**Inference:** One composite number per terminal — incident intensity, congestion and compliance blended — driving the twin's colour and the ranking list.

**Evidence:**

```json
{
  "top5": [
    [
      "Single Point Moorings",
      84.2,
      35.7,
      14.7,
      3
    ],
    [
      "CT-4 (ACMT JV)",
      75.3,
      24.4,
      16.0,
      3
    ],
    [
      "Multipurpose Terminal",
      51.4,
      18.4,
      15.6,
      3
    ],
    [
      "Adani Mundra Container Terminal",
      51.2,
      14.9,
      19.0,
      2
    ],
    [
      "CT-3 (AICT)",
      50.2,
      15.9,
      16.1,
      3
    ]
  ],
  "weights": "incident rate 35 \u00b7 waiting 25 \u00b7 high-severity 25 \u00b7 detentions 15"
}
```

### [B2] Volume and risk are different lists  _(severity: medium)_

**Inference:** The busiest terminal is not the riskiest — targeting attention by volume alone would miss where incidents and congestion actually cluster.

**Evidence:**

```json
{
  "largest_by_cargo": [
    "Single Point Moorings",
    6013333
  ],
  "highest_risk": [
    "Single Point Moorings",
    84.2
  ]
}
```


## C. HSE & incidents

### [C1] Incident intensity and the near-miss ratio  _(severity: high)_

**Inference:** A healthy safety culture reports many near-misses per serious event (Heinrich ratio). Track this number monthly: a falling near-miss ratio with steady severity means under-reporting, not improvement.

**Evidence:**

```json
{
  "incidents_last12m": 75,
  "high_critical_last12m": 20,
  "injuries_last12m": 8,
  "near_miss_per_high_severity": 0.6
}
```

### [C2] Oil-sheen / spill events by year  _(severity: medium)_

**Inference:** Tier-1 sheen events cluster around bunkering and hose work at the liquid berths; each carries GPCB notification duty. The trend line, not any single event, is the regulator conversation.

**Evidence:**

```json
{
  "per_year": {
    "2023": 10,
    "2024": 14,
    "2025": 7,
    "2026": 3
  }
}
```

### [C3] Equipment-failure incidents by year  _(severity: medium)_

**Inference:** Crane, gangway and conveyor failures are the largest single incident class — the maintenance-planning conversation belongs in the same room as HSE.

**Evidence:**

```json
{
  "per_year": {
    "2023": 21,
    "2024": 17,
    "2025": 19,
    "2026": 3
  }
}
```


## D. Predictive early-warning

### [D1] Traffic trajectory by terminal  _(severity: medium)_

**Inference:** Where the next year's traffic pressure lands if trends hold — the berth-window and manning plan should be built against these slopes, not last year's average.

**Evidence:**

```json
{
  "fastest_growing": [
    [
      "CT-4 (ACMT JV)",
      1,
      0.6,
      1.64
    ],
    [
      "CT-3 (AICT)",
      6,
      0.6,
      2.55
    ],
    [
      "Adani Mundra Container Terminal",
      2,
      0.4,
      2.1
    ],
    [
      "West Basin Coal Terminal",
      4,
      0.3,
      2.31
    ]
  ],
  "softest": [
    [
      "MICT (DP World JV)",
      2,
      0.2,
      2.0
    ],
    [
      "Liquid Berths",
      5,
      -0.1,
      1.71
    ],
    [
      "AMCT-2",
      1,
      -0.2,
      2.08
    ]
  ],
  "note": "[terminal, latest monthly calls, trend calls/yr, volatility]"
}
```

### [D2] Berth occupancy headroom  _(severity: medium)_

**Inference:** Every terminal sits below the UNCTAD 40-70% congestion band — the port can absorb its own growth trend for years before berth capacity binds; marketing, not construction, is the growth constraint.

**Evidence:**

```json
{
  "highest_occupancy_latest": [
    [
      "Multipurpose Terminal",
      13.4
    ],
    [
      "CT-4 (ACMT JV)",
      9.4
    ],
    [
      "CT-3 (AICT)",
      6.8
    ]
  ],
  "healthy_band_pct": [
    40.0,
    70.0
  ]
}
```


## E. Patterns

### [E1] What moves with terminal risk  _(severity: low)_

**Inference:** Correlates of the composite: congestion and incident intensity dominate; raw volume alone is a weak predictor of risk.

**Evidence:**

```json
{
  "risk_vs": {
    "calls": 0.08,
    "wait": 0.04,
    "occ": 0.14,
    "inc_per_100": 0.79,
    "hi": 0.84
  }
}
```

### [E2] Terminal typologies (k-means, 3 clusters)  _(severity: low)_

**Inference:** Data-driven segmentation: high-volume container quays, steady bulk berths, and the low-frequency/high-consequence liquid & offshore group each need a different operating playbook.

**Evidence:**

```json
{
  "profiles": [
    [
      0.0,
      5.0,
      30.4,
      15.0,
      23.5
    ],
    [
      1.0,
      1.0,
      40.0,
      12.2,
      25.0
    ],
    [
      2.0,
      4.0,
      50.2,
      16.9,
      14.1
    ]
  ],
  "members": {
    "0": [
      "Single Point Moorings",
      "CT-4 (ACMT JV)",
      "Liquid Berths",
      "Ro-Ro Terminal",
      "AMCT-2"
    ],
    "1": [
      "West Basin Coal Terminal"
    ],
    "2": [
      "Multipurpose Terminal",
      "Adani Mundra Container Terminal",
      "CT-3 (AICT)",
      "MICT (DP World JV)"
    ]
  }
}
```


## F. Benchmark vs major ports

### [F1] Mundra vs Indian major-port averages  _(severity: high)_

**Inference:** The credibility yardstick: berth-day output runs ~3x the major-port average (mechanised terminals), turnaround is competitive, and the PSC detention rate sits near the regional MoU norm — the one number to watch, not celebrate.

**Evidence:**

```json
{
  "turnaround_hr": {
    "mundra_last12m": 55.0,
    "major_ports_avg": 50.4
  },
  "output_mt_per_berthday": {
    "mundra_latest": 56939.0,
    "major_ports_avg": 16500.0
  },
  "psc_detention_rate_pct": {
    "mundra_last12m": 9.5,
    "indian_ocean_mou_2023": 5.6
  }
}
```


## G. Revenue

### [G1] Collections vs the 95% target  _(severity: high)_

**Inference:** Cumulative collection efficiency against the commercial target, with the outstanding book in crore — the number the CFO reads first; the terminal-level split shows which agents' books drive the receivable.

**Evidence:**

```json
{
  "billed_last12m_cr": 274.6,
  "collected_last12m_cr": 265.0,
  "cumulative_collection_pct": 98.7,
  "outstanding_cr": 10.56,
  "target_pct": 95.0
}
```

### [G2] Outstanding receivables by terminal  _(severity: medium)_

**Inference:** Where the receivable concentrates; pair with the agent directory for the collection call list.

**Evidence:**

```json
{
  "top": [
    [
      "CT-4 (ACMT JV)",
      3.2,
      94.6
    ],
    [
      "AMCT-2",
      2.7,
      93.3
    ],
    [
      "Multipurpose Terminal",
      2.0,
      97.5
    ],
    [
      "CT-3 (AICT)",
      1.4,
      98.4
    ],
    [
      "MICT (DP World JV)",
      0.8,
      98.0
    ]
  ]
}
```
