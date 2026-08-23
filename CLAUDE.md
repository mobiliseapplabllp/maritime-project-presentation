# CLAUDE.md — Maritime Project (MALL)

This repo holds two related deliverables for the maritime prospect engagement:

1. `deck/` + `docs/` — the capability & delivery presentation (Part I–III dossier).
2. `portal/` — **Mundra Port Operations Portal**: a working MERN demo of the platform,
   seeded with sample data for Adani Mundra Port (INMUN). All data is fictional sample data.

## Portal architecture

- `portal/backend` — Node 22 + Express + Mongoose. JWT auth (access+refresh), RBAC by
  permission strings, audit log on every write, notifications, consistent
  `{ success, data, meta }` responses. Entry: `server.js`. Seed: `npm run seed`.
- `portal/frontend` — React 18 + Vite + MUI (Material Design) + Redux Toolkit + Recharts.
  Theme: teal `#0E7C86` / ink `#0B1F2A` / amber accent, light+dark modes.
- Database: standard `MONGO_URI` (MongoDB/Atlas in production). In sandboxed dev where
  mongodb.org is unreachable, `npm run devdb` starts FerretDB (Mongo wire protocol over
  SQLite) on the same URI. Keep queries to the common operator set
  (find/sort/skip/limit/count, `$in/$gte/$lte/$regex`); compute dashboard aggregates in JS.

## Commands

```bash
cd portal/backend && npm run devdb     # start dev DB :27017 (FerretDB)
cd portal/backend && npm run seed      # reset + seed Mundra sample data
cd portal/backend && npm run dev       # API on :5200
cd portal/backend && npm test          # node:test unit + API tests
cd portal/frontend && npm run dev      # UI on :5300 (proxies /api -> :5200)
cd portal/frontend && npm run build
```

## Conventions

- Permissions are `module.action` strings; the catalog lives in
  `backend/src/config/constants.js` and is the single source for backend middleware,
  seeding, and the frontend matrix editor.
- Every mutating controller writes an AuditLog entry (actor, entity, before/after).
- Port-call status transitions are enforced server-side from `PORTCALL_TRANSITIONS`.
- Sample data must stay plainly fictional (fictional vessels/agents; "sample" GST no).
