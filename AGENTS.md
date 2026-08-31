# AGENTS.md — Maritime Project (MALL)

**New here? Read `HANDOVER.md` first** — full state of play, decisions, gotchas
and open items.

This repo holds three deliverables for the maritime prospect engagement:

1. `deck/` + `docs/` — the capability & delivery presentation (Part I–III dossier).
2. `portal/` — **Mundra Port Operations Portal**: a working MERN application,
   seeded with 3.6 years of sample data for Adani Mundra Port (INMUN).
3. `maritime-ai/` — **Sagar Drishti**: the AI analytics portal (FastAPI + React)
   over the same dataset. Has its own `AGENTS.md` and `CONTRACT.md` — read those
   before touching it.

All transactional data in both portals is fictional.

## Data rules — non-negotiable

- Real infrastructure and public statistics are fine and encouraged (berths,
  terminals, IPA/UNCTAD/Indian Ocean MoU benchmarks).
- Every transaction, agent, incident, invoice, detention and crew record is
  fictional.
- The 8 documented real liner callers (MSC Anna, APL Raffles, MSC Al Rawdah,
  Maersk Kensington, Maersk Chicago, CMA CGM Ural, ESL Wafa, Folk Jazan) appear
  for schedule realism only and **carry clean records**. Code excludes them from
  incidents, inspections, billing and watchlists — keep it that way.
- GSTINs are marked `(sample)`.
- Do **not** apply the MALL SDLC skill to this project; the user asked for direct
  execution.

## Operations portal architecture

- `portal/backend` — Node 22 + Express + Mongoose. JWT auth (access+refresh), RBAC
  by permission strings, audit log on every write, notifications, consistent
  `{ success, data, meta }` responses. Entry: `server.js`. Seed: `npm run seed`.
- `portal/frontend` — React 18 + Vite + MUI + Redux Toolkit + Recharts.
  Theme: teal `#0E7C86` / ink `#0B1F2A` / amber accent, light+dark modes.
- Database: standard `MONGO_URI` (MongoDB/Atlas in production). In sandboxed dev
  where mongodb.org is unreachable, `npm run devdb` starts FerretDB (Mongo wire
  protocol over SQLite) on the same URI. Keep queries to the common operator set
  (find/sort/skip/limit/count, `$in/$gte/$lte/$regex`); compute dashboard
  aggregates in JS.

## Commands

```bash
# operations portal
cd portal && docker compose up --build   # everything → http://localhost:5200
cd portal/backend && npm run devdb       # or piecemeal: dev DB :27017 (FerretDB)
cd portal/backend && npm run seed        # reset + seed Mundra sample data
cd portal/backend && npm run dev         # API on :5200
cd portal/backend && npm test && npm run test:api && npm run test:security
cd portal/frontend && npm run build

# Sagar Drishti AI portal
cd maritime-ai/portal && make install && make dev   # UI :5273, API :8010
python3 maritime-ai/data/mundra/build_panels.py     # rebuild panels after a reseed
python3 maritime-ai/analysis/analyze_mundra.py      # then the findings engine
```

## Conventions

- Permissions are `module.action` strings; the catalog lives in
  `backend/src/config/constants.js` and is the single source for backend
  middleware, seeding, and the frontend matrix editor.
- Every mutating controller writes an AuditLog entry (actor, entity, before/after).
- Port-call status transitions are enforced server-side from `PORTCALL_TRANSITIONS`.
- **Demo parity:** any backend feature must be mirrored in
  `portal/frontend/src/api/demoClient.js`, or the shareable demo bundle silently
  loses it.
- Regenerate the demo snapshot only from a **freshly reseeded** database — running
  the test suite first leaves residue in it.
- Seed data is deterministic (fixed PRNG seed); `HIST_START` = Jan 2023 anchors
  every history window.

## Verification bar

Before calling any change done: `npm test && npm run test:api && npm run
test:security` (26 tests), an eslint `no-undef` sweep, both bundles building
clean, and a Playwright drive against the live backend **and** the demo bundle.
Screenshots of what actually runs, then commit and push — the cloud container is
ephemeral.
