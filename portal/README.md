# Mundra Port Operations Portal

A working MERN demonstration of the maritime platform for **Adani Mundra Port (INMUN)** —
port calls, berthing, cargo, vessel registry, certificates, inspections, billing, RBAC,
audit and dashboards. **All sample data is fictional.**

![stack](https://img.shields.io/badge/stack-MongoDB%20·%20Express%20·%20React%2018%20·%20Node%2022-0E7C86)

## Deploy locally — one command

With Docker Desktop installed:

```bash
cd portal
docker compose up --build
```

Open **http://localhost:5200** — UI and API on one port, MongoDB in a container,
sample data seeded automatically on first run. When you have a domain, the same
compose file runs on any VPS; put nginx/Caddy with TLS in front of :5200 and set
real `JWT_SECRET`s.

## Quick start (dev, without Docker)

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
| **Modules** | App-launcher shell (header waffle + per-module icon strip); each module loads its own side menu: Dashboard, Port Operations, Ships Registry, Seafarers, Legislation & Circulars, Maritime Centre (live traffic + incidents/SAR), Inspection & Audit, Compliance & Risk, Facilities & Companies, Finance, Masters, Administration |
| **Seafarers** | Crew register with STCW/CoC/medical certificates (derived expiry), verified sea-service ledger |
| **Legislation** | Instrument library (acts, rules, circulars, notices) with supersession links and per-user acknowledgment tracking |
| **Maritime Centre** | Stylised Gulf-of-Kutch traffic picture (simulated AIS), MDA alerts with acknowledge, MRCC incident log (SAR/pollution/security/medevac) with ops timeline and close-out |
| **Risk engine** | Explainable factor-weighted vessel scores (age, certificates, deficiencies, detentions, inspection gap, agent fleet record), PSC targeting list, audited weight editor |
| **Facilities** | Licence lifecycle APPLIED→UNDER_REVIEW→ISSUED with suspend/reinstate/revoke, audits and performance rating |
| **AI assistant** | Grounded chatbot over live records (deterministic engine shared with the demo build; backend upgrades replies via claude-opus-5 when ANTHROPIC_API_KEY is set) — every answer cites the screen it came from |
| **UX** | 75%-width slide-over add/edit drawers that keep the side menu visible, Adani-gradient network activity bar, branded module-switch and route loaders |
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

## Read-only demo build

`VITE_DEMO=1 npx vite build --outDir dist-demo` compiles the same UI against
`src/api/demoClient.js` — an in-browser read-only backend serving
`src/demo/snapshot.json` (regenerate with `node backend/scripts/export-demo.js`
while the dev DB is up). Lists, search, filters, pagination, details, dashboards
and RBAC all work from the snapshot; writes are refused with a friendly message.
Used to publish the zero-install shareable demo.
