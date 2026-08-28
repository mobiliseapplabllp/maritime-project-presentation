# Sagar Drishti — Mundra Evidence Pack

*Auto-generated from the terminal×month panels. Span 2023-01..2026-07; latest complete month 2026-07. Portal demo world (fictional); benchmarks from public major-port statistics.*


## A. Operations efficiency

### [A2] Pre-berthing waits above 24h concentrate at a few terminals  _(severity: high)_

**Inference:** A persistent tail of calls waits more than a day for a berth. The wait is not uniform — it concentrates where cargo mix meets berth compatibility limits, so berth-window planning (not dredging or capex) is the first lever.

**Evidence:**

```json
{
  "share_calls_waited_gt24h_pct": 21.4,
  "latest_month_worst": [
    [
      "CT-3 (AICT)",
      22.3,
      3
    ],
    [
      "West Basin Coal Terminal",
      18.2,
      6
    ],
    [
      "Ro-Ro Terminal",
      18.0,
      1
    ],
    [
      "Multipurpose Terminal",
      16.2,
      11
    ],
    [
      "Liquid Berths",
      13.3,
      3
    ]
  ],
  "major_ports_avg_preberthing_hr": 5.0
}
```

### [A1] Turnaround time improved while traffic grew  _(severity: medium)_

**Inference:** Average turnaround moved from 61h to 66h while monthly calls grew ~38% — throughput scaled without eroding vessel service time.

**Evidence:**

```json
{
  "avg_turnaround_2023_hr": 61.4,
  "avg_turnaround_last12m_hr": 65.7,
  "calls_2023_per_month": 16.5,
  "calls_last12m_per_month": 22.8,
  "major_ports_avg_hr": 50.4
}
```

### [A3] Berth-on-arrival service level  _(severity: medium)_

**Inference:** The share of vessels berthed within six hours of arrival is the customer-facing service number agents quote; lifting it is mostly a scheduling discipline gain.

**Evidence:**

```json
{
  "berthed_within_6h_pct_latest": 14.3,
  "trailing_12m_pct": 16.8
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
      60.0,
      45.8,
      15.2,
      5
    ],
    [
      "Liquid Berths",
      54.4,
      40.5,
      15.7,
      4
    ],
    [
      "Multipurpose Terminal",
      50.7,
      12.0,
      17.9,
      3
    ],
    [
      "CT-3 (AICT)",
      44.7,
      27.8,
      17.4,
      2
    ],
    [
      "CT-4 (ACMT JV)",
      41.6,
      28.1,
      14.1,
      7
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
    5536128
  ],
  "highest_risk": [
    "Single Point Moorings",
    60.0
  ]
}
```


## C. HSE & incidents

### [C1] Incident intensity and the near-miss ratio  _(severity: high)_

**Inference:** A healthy safety culture reports many near-misses per serious event (Heinrich ratio). Track this number monthly: a falling near-miss ratio with steady severity means under-reporting, not improvement.

**Evidence:**

```json
{
  "incidents_last12m": 74,
  "high_critical_last12m": 22,
  "injuries_last12m": 14,
  "near_miss_per_high_severity": 0.4
}
```

### [C2] Oil-sheen / spill events by year  _(severity: medium)_

**Inference:** Tier-1 sheen events cluster around bunkering and hose work at the liquid berths; each carries GPCB notification duty. The trend line, not any single event, is the regulator conversation.

**Evidence:**

```json
{
  "per_year": {
    "2023": 3,
    "2024": 6,
    "2025": 7,
    "2026": 6
  }
}
```

### [C3] Equipment-failure incidents by year  _(severity: medium)_

**Inference:** Crane, gangway and conveyor failures are the largest single incident class — the maintenance-planning conversation belongs in the same room as HSE.

**Evidence:**

```json
{
  "per_year": {
    "2023": 7,
    "2024": 8,
    "2025": 10,
    "2026": 7
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
      "Multipurpose Terminal",
      1,
      1.0,
      3.4
    ],
    [
      "Liquid Berths",
      2,
      0.4,
      1.7
    ],
    [
      "West Basin Coal Terminal",
      5,
      0.4,
      1.82
    ],
    [
      "CT-3 (AICT)",
      6,
      0.2,
      1.69
    ]
  ],
  "softest": [
    [
      "CT-4 (ACMT JV)",
      2,
      0.1,
      2.67
    ],
    [
      "Single Point Moorings",
      2,
      0.1,
      1.62
    ],
    [
      "Ro-Ro Terminal",
      4,
      -0.1,
      1.54
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
      "West Basin Coal Terminal",
      30.0
    ],
    [
      "Multipurpose Terminal",
      28.0
    ],
    [
      "Single Point Moorings",
      8.4
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
    "calls": 0.29,
    "wait": 0.24,
    "occ": 0.02,
    "inc_per_100": 0.48,
    "hi": 0.62
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
      4.0,
      30.5,
      15.8,
      34.8
    ],
    [
      1.0,
      2.0,
      59.0,
      17.3,
      13.0
    ],
    [
      2.0,
      1.0,
      57.0,
      14.1,
      28.1
    ]
  ],
  "members": {
    "0": [
      "Single Point Moorings",
      "Liquid Berths",
      "CT-3 (AICT)",
      "Ro-Ro Terminal"
    ],
    "1": [
      "Multipurpose Terminal",
      "West Basin Coal Terminal"
    ],
    "2": [
      "CT-4 (ACMT JV)"
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
    "mundra_last12m": 65.7,
    "major_ports_avg": 50.4
  },
  "output_mt_per_berthday": {
    "mundra_latest": 37444.0,
    "major_ports_avg": 16500.0
  },
  "psc_detention_rate_pct": {
    "mundra_last12m": 6.9,
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
  "billed_last12m_cr": 245.8,
  "collected_last12m_cr": 233.5,
  "cumulative_collection_pct": 97.2,
  "outstanding_cr": 18.62,
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
      "West Basin Coal Terminal",
      8.7,
      94.6
    ],
    [
      "Single Point Moorings",
      5.7,
      97.1
    ],
    [
      "Multipurpose Terminal",
      3.6,
      96.1
    ],
    [
      "Ro-Ro Terminal",
      0.6,
      98.7
    ],
    [
      "CT-3 (AICT)",
      0.0,
      100.0
    ]
  ]
}
```
