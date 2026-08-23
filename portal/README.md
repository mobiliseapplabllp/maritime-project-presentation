# Mundra Port Operations Portal

A working MERN demonstration of the maritime platform for **Adani Mundra Port (INMUN)** —
port calls, berthing, cargo, vessel registry, certificates, inspections, billing, RBAC,
audit and dashboards. **All sample data is fictional.**

![stack](https://img.shields.io/badge/stack-MongoDB%20·%20Express%20·%20React%2018%20·%20Node%2022-0E7C86)

## Quick start

```bash
# 1. database — MongoDB on mongodb://127.0.0.1:27017, or in a sandbox:
cd backend && npm install && npm run devdb        # FerretDB (Mongo wire protocol over SQLite)

# 2. API
cd backend
cp .env.example .env                              # set real JWT secrets outside demos
npm run seed                                      # deterministic Mundra dataset
npm run dev                                       # http://localhost:5200

# 3. UI
cd frontend && npm install && npm run dev         # http://localhost:5300 (proxies /api)
```

### Sample accounts — password `Mundra@2026`

| Email | Role | Sees |
|---|---|---|
| admin@mundraport.in | Super Admin | everything |
| harbour@mundraport.in | Harbour Master | operations: calls, berthing, cargo |
| surveyor@mundraport.in | Marine Surveyor | inspections, certificates |
| finance@mundraport.in | Finance Officer | invoices, tariffs |
| agent@mundraport.in | Shipping Agent | announce calls, view invoices |

## What's inside

| Area | Detail |
|---|---|
| **Port calls** | ANNOUNCED → CONFIRMED → AT_ANCHORAGE → BERTHED → SAILED (+CANCELLED), transitions enforced server-side, berth-window conflict detection names the clashing call, services + cargo ops sub-resources, status timeline |
| **Vessels & certificates** | registry CRUD, statutory certificates with derived VALID / EXPIRING / EXPIRED, fleet-wide expiry register |
| **Inspections** | PSC/FSI/ISM/ISPS/MLC, checklist copied from templates, YES/NO/NA capture, findings with PSC-style deficiency + action codes, close workflow, detention notifications |
| **Billing** | invoice generated from GRT + services + cargo via the tariff master, paise-exact totals with 18% GST, DRAFT → ISSUED → PAID, print view |
| **Masters** | berths/terminals, lookups (vessel & cargo types, ports, agents, deficiency codes), tariffs, checklist templates — one config-driven CRUD engine |
| **RBAC** | `module.action` permission strings, matrix editor, role changes apply on the next request, nav + routes + buttons all permission-filtered |
| **Audit** | every write logged with actor, before/after snapshots; viewer with JSON diff |
| **Dashboard** | KPI cards, 12-month throughput by cargo group, ranked cargo mix, revenue trend, live berth board, arrivals, expiring certificates (chart palette validated for CVD safety in light + dark) |

## Architecture

```
frontend/  React 18 + Vite + MUI 5 + Redux Toolkit + Recharts
           src/components/common/CrudPage.jsx   ← config-driven CRUD engine
           src/theme.js                         ← light/dark + validated chart palettes
backend/   Express + Mongoose (CommonJS)
           src/config/constants.js              ← permission catalog + workflow rules (single source)
           src/domain/                          ← pure logic: transitions, conflicts, invoice math, expiry
           src/controllers/ · src/routes/       ← REST /api, {success,data,meta} envelope
           scripts/seed.js                      ← deterministic INMUN dataset
```

**Database note.** Code is standard Mongoose against `MONGO_URI`. In sandboxes where
mongodb.org is unreachable, `npm run devdb` serves the same URI with FerretDB (SQLite
backing). Queries deliberately stay on the common operator set; dashboard aggregation is
computed in Node.

## Tests

```bash
cd backend && npm test        # 8 domain tests: transitions, conflicts, invoice math, expiry, rbac
npm run test:api              # 5 end-to-end API tests (needs dev DB + seed); reseed afterwards
```

## Security posture (demo)

Implemented: bcrypt (10 rounds), JWT access+refresh with separate secrets, per-request
role loading, server-side permission checks on every route, field whitelisting, regex
escaping, login throttling (10 fails / 15 min), audit trail, `x-powered-by` disabled,
generic 500 messages. **Before any real deployment:** rotate `.env` secrets, put TLS in
front, move refresh tokens to httpOnly cookies, add helmet + CSP, external rate limiting,
and structured log shipping.
