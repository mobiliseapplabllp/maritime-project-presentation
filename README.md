# Maritime Digital Platform — Capability & Delivery Dossier

Pre-sales and tender-response material for a **national maritime authority or port authority**
in the Gulf region. Prepared by **Mobilise App Lab**.

This repository is standalone. It has no relationship to, and shares no code with, any other
Mobilise App Lab project.

## What is here

| Path | What it is |
|---|---|
| `portal/` | **Mundra Port Operations Portal** — a working MERN demo of the platform (React + MUI + Express + Mongoose), seeded with fictional Adani Mundra data. See `portal/README.md`. |
| `maritime-ai/` | **Sagar Drishti — Mundra Port AI Analytics** — the AI layer: findings engine, AI chat with RAG, 3D port twin, agent workforce, work orders, voice mode (FastAPI + React). Runs on the portal's own demo dataset. See `maritime-ai/README.md`. |
| `mobile-flutter/` | **Maritime Mobile** — two native apps (Marine Ops for the authority, Maritime Services for the customer) built in Flutter, live against the portal APIs with the same RBAC, audit and agents. 12/12 integration tests pass on the iOS simulator. See `mobile-flutter/README.md`. |
| `mobile-app/` | The React implementation of the design-handoff **interactive prototype** — the behavioural spec both Flutter apps were built from. `design-reference/` holds the original Claude Design export. |
| `deploy-local.sh` | **One-command local deploy** — brings up the platform (API + web portal + MongoDB, auto-seeded) and launches the mobile apps. See below. |
| `deck/index.html` | The presentation — 26 slides, self-contained, works offline. Arrow keys or scroll. |
| `docs/00-claims-and-evidence.md` | **Read this before issuing anything.** Every factual claim in the deck with its evidence status. |
| `docs/01-capability-model.md` | Part I in full — the seven domains, five capability spines, and the Core/Configure/Extend/Build model. |
| `docs/02-delivery-confidence.md` | Part II in tender-response prose — delivery capability, the proof-of-capability offer, roadmap, risk. |
| `docs/03-agentic-ai-architecture.md` | Part III in full — agent specifications, orchestration, autonomy tiers, guardrails, audit. |
| `build/make_pptx.js` | Generates the editable PowerPoint from the same content. |

## Running the platform and the mobile apps

One script stands up everything. It brings up the portal (web UI + API + MongoDB,
seeded with the demo world automatically) via Docker, then launches the apps.

```bash
./deploy-local.sh
```

That leaves the platform running at **http://localhost:5200** (sign in with
`admin@maritime.example` / `Demo@2026`) and prints how to start each mobile app.
Then, each in its own terminal:

```bash
./deploy-local.sh --web        # React prototype  → http://localhost:5174
./deploy-local.sh --flutter    # Flutter app      → iOS simulator
```

Housekeeping:

```bash
./deploy-local.sh reset        # wipe the demo data and re-seed a clean world
./deploy-local.sh stop         # stop the platform (data preserved)
```

**Prerequisites** — Docker Desktop (platform), Node.js (React prototype), and Flutter
+ Xcode (Flutter app). Every seeded account uses the password `Demo@2026`; Authority
identities are `surveyor@` / `harbour@` / `nmc@` / `admin@maritime.example`, Customer
identities are `agent@` / `finance@maritime.example`. The Flutter app targets
`127.0.0.1:5200` by default (matching the Docker portal); for a real device pass
`--dart-define=API_BASE=https://your-host/api`. To run one app pointed at another
simulator, set `SIM_UDID=<udid> ./deploy-local.sh --flutter`.

## Viewing the deck

Open `deck/index.html` in any browser. No build step, no network dependency other than
Google Fonts (which degrades to system fonts cleanly if blocked).

- <kbd>→</kbd> / <kbd>Space</kbd> — next slide · <kbd>←</kbd> — previous · <kbd>Home</kbd> / <kbd>End</kbd> — jump
- Left rail — jump to any slide; **Theme** button toggles light/dark

## Building the PowerPoint

```bash
npm install          # pptxgenjs
node build/make_pptx.js
# writes dist/maritime-platform-capability.pptx
```

Validate and QA the result:

```bash
python3 ~/.claude/skills/synced/pptx/scripts/office/validate.py dist/maritime-platform-capability.pptx
```

## The three questions this material answers

1. **Does the platform already cover the domains?** — Ships, Seafarers, Legislation & circulars,
   National Maritime Centre, Smart inspection & audit, Ports, Maritime facilities & companies;
   across registration & certification, compliance & risk, vessel tracking, port & terminal
   operations, and inspection & survey. Marked per capability as Core / Configure / Extend / Build.
2. **Can we deliver it for a ministry or port authority?** — Answered with demonstrable engineering
   capability and a funded eight-week proof of capability on the client's own data, **not** with
   maritime case studies we do not have.
3. **What does the agentic AI layer actually do?** — Ten scoped agents, four enforced autonomy
   tiers, mandatory citation, and a full audit ledger.

## Standing rule for this material

> No client name, contract value, user count, uptime figure, or project outcome goes into this
> deck unless it appears in `docs/00-claims-and-evidence.md` with a status of **VERIFIED** and a
> document reference.

A maritime administration verifies references. An unverifiable claim is not a weak claim — in a
government procurement it is a disqualifying one.
