# Sagar Drishti — Mundra Port AI Analytics

A full-stack, AI-first analytics portal for Mundra Port, built as part of the
maritime pre-sales package. Fork of the Sodexo HTM AI engine (itself from
POSHAN Drishti) re-pointed at the port domain — every capability of the
original platform, speaking maritime:

- **Dashboard** — port → zone → terminal → berth drill-down over 3.6 years of
  monthly panels (traffic, cargo, marine services, HSE, revenue)
- **3D port twin** — the actual Mundra terminal layout (Navinal Island / West
  Basin / SPMs) extruded by composite terminal risk
- **Clarity AI chat** — data mode (text-to-SQL over the panels), documents mode
  (RAG over the maritime library), report mode, voice mode; "✨ AI explain" on
  every card
- **Findings engine** — 15 evidence-backed findings across operations
  efficiency, hotspots, HSE, prediction, patterns, benchmark and revenue
- **Agent workforce** — Harbour Collector, Berth Sentinel, Marine Auditor,
  Berth Planner, Trade Analyst, Duty Officer on scheduled cycles
- **Work orders** — SLA-bound actions drafted by AI from findings, with full
  provenance
- **Trilingual** — English / हिन्दी / ગુજરાતી, plus neural TTS voice mode

## The data

The panels are derived from the **Mundra Port Operations Portal's**
deterministic demo snapshot (`../portal/frontend/src/demo/snapshot.json`) —
both products share one fictional world (Jan 2023 → today). Benchmarks come
from public Indian major-port statistics. Real liner vessels carry clean
records and never appear on watchlists.

```
data/mundra/build_panels.py      snapshot → tidy unit×month panels (CSV)
analysis/analyze_mundra.py       panels → findings + rankings + sections
data/geo_mundra/build_geo.py     berth coordinates → terminal GeoJSON
```

Regenerate after a portal reseed: run the three scripts in that order.

## Run it

```bash
cd maritime-ai/portal
make install     # backend (pip --user) + frontend (npm) deps
make dev         # backend :8010 + frontend :5273 (+ TTS if venv exists)
```

Open **http://localhost:5273**. Demo logins (password `Mundra@2026`):

| Username | Role | Scope |
|---|---|---|
| `harbour.master` | Harbour Master — Port Administrator | whole port |
| `head.container` | Head — Container Business | Container zone |
| `tm.mict` | Terminal Manager — MICT | MICT terminal |
| `hse.chief` | Chief — HSE & Environment | whole port |
| `finance` | Controller — Revenue & Billing | whole port |
| `analyst` | Data Analyst — Port MIS | whole port |

AI features use the local `claude` CLI (OAuth — run `claude login` once); no
API key required. Everything degrades gracefully without it (builtin intents
answer the common questions). Optional neural voices: see `portal/README.md`.

Ports: backend **8010**, frontend **5273**, TTS sidecar **8020** — none clash
with the operations portal (5200).

## Docs

- `CONTRACT.md` — the domain contract (hierarchy, panels, columns, artifacts,
  branding, accounts). Read it before changing anything.
- `analysis/out_mundra/evidence.md` — the generated evidence pack.
