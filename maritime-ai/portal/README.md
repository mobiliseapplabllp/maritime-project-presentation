# Sagar Drishti — Mundra Port AI Analytics

A full-stack analytics portal over the **Mundra Port** operations world — vessel
traffic, berth performance, HSE incidents, PSC compliance, certificates and
revenue, port → zone → terminal → berth. Login screen, sidebar app shell,
multi-screen analytics, a 3D terminal twin, an autonomous agent workforce and an
AI analyst ("Sagar Intelligence") with chat, reports and voice mode.

**Mundra Port · Kutch, Gujarat** (deterministic demo world; all transactions fictional)

---

## Run it

```bash
cd portal
make install     # backend (pip --user) + frontend (npm) deps
make dev         # backend :8010 + frontend :5273 (+ TTS :8020 if installed)
```

Then open **http://localhost:5273**.

Demo logins (password `Mundra@2026` for all):

| Username | Role | Scope |
|---|---|---|
| `harbour.master` | Harbour Master · Port Administrator | port |
| `head.container` | Head — Container Business | zone: Container |
| `tm.mict` | Terminal Manager — MICT | terminal: MICT |
| `hse.chief` | Chief — HSE & Environment | port |
| `finance` | Controller — Revenue & Billing | port |
| `analyst` | Data Analyst — Port MIS | port |

> Run backend and frontend separately with `make backend` / `make frontend` if you
> prefer two terminals. Stop everything with `make stop`.

---

## Architecture

```
Browser (React SPA, Vite :5273)
   │  /api/* proxied →
FastAPI backend (:8010)  ── JWT auth (seeded port accounts, RBAC scopes)
   ├─ /api/overview, /units, /region, /hotspots, /compliance, /predictions,
   │  /heatmap (terminal twin), /sections, /records/*, /yearbook, /agents, /findings
   └─ /api/chat  ── built-in data assistant  +  Claude LLM fallback (text-to-SQL)
        │
   in-memory pandas panels + SQLite analytics mirror
        ←  data/mundra/portal/processed/{ops,marine,hse,revenue}.csv
           analysis/out_mundra/ (findings, hotspot_ranking, vessel_watchlist, benchmark…)
           data/geo_mundra/ (terminal polygons + berth points for the 3D twin)
Sagar Neural TTS sidecar (:8020, optional)  ── human-quality en/hi voices
```

- **Backend** (`backend/app/`): routes, JWT auth + RBAC scoping
  (`port` | `zone:Container` | `terminal:MICT` | `berth:CT3-1`), panel loading,
  one analytics endpoint per screen, the agent workforce, and the hybrid chatbot.
- **Frontend** (`frontend/src/`): React + React Router + Recharts + three.js.
  `pages/` = one per screen, `components/` = shell / charts / chat / twin,
  `lib/` = api + auth + i18n (EN / हिन्दी / ગુજરાતી).
- Data is loaded read-only from the analysis outputs elsewhere in the repo; no
  database server required.

## The chatbot & voice

Two tiers, automatic:
1. **Built-in data assistant** — answers common questions (waiting queues,
   terminal lookups, watchlist, findings, overview) instantly from the panels,
   with charts. Works offline, no API key.
2. **Claude LLM fallback** — for free-form questions and full formatted reports,
   if `ANTHROPIC_API_KEY` is set in the backend environment (the backend also
   uses the `claude` CLI when available). It answers grounded in the findings
   and can query the analytics mirror via a read-only SQL tool. Without a key,
   the portal cleanly tells the user which built-in questions it can answer.

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # before `make dev` to enable the LLM tier
```

**Voice**: `make tts` starts the optional Sagar Neural engine (:8020) for
human-quality English/Hindi speech; Gujarati (and any browser without the
sidecar) falls back to the browser's speechSynthesis voices. Voice Mode gives a
hands-free conversation loop; the chat widget can also read answers aloud.

## Screens

- **Dashboard** — traffic/turnaround/waiting/occupancy KPIs vs the major-port benchmarks.
- **Sagar Intelligence** — natural-language reports (copy / email / PDF) + docs mode (RAG).
- **Port Explorer** — all 24 berths and 10 terminals, the port benchmark league, and the **3D terminal twin** (risk-extruded terminal polygons over the Mundra estate).
- **Deep Analysis** — Fleet & Vessels, Incidents, Inspections & Surveys, Certificates (statutory register), Revenue & Receivables, Crew & Manning; every register row opens a full record portal (vessel / incident / inspection / seafarer / berth / terminal).
- **AI Analysis** — Operations Audit, Benchmark vs Major Ports, Terminal Hotspots, Early Warning, Training Log (the QA self-testing loop).
- **Agent Operations** — Harbour Collector, Berth Sentinel, Marine Auditor, Berth Planner, Trade Analyst under the Duty Officer, on a 2-hourly cycle.
- **Year Gone By / Interesting Facts / Research briefings** — the year in numbers, curated facts, and daily Mundra-vs-major-ports & APSEZ-vs-operators research.

## Notes / next steps

- Deterministic demo world; **berth is the finest grain**. A live AIS/VTMS feed
  plugs in behind the same API.
- Auth uses seeded accounts with real JWT + hashed passwords — swap the seed
  users for a real directory to productionise. OTP email sign-in and SMTP are
  configurable from Users & Email.
- Ports: backend **8010**, frontend **5273**, TTS **8020** — unchanged from the
  engine this portal is forked from.
- Roadmap: live AIS ingestion, the port document library for RAG, tide/UKC-aware
  berth-window planning, and templating the connector to the other APSEZ ports.
