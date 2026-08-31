# Handover — Maritime Project (Mundra Port)

**Last updated:** 24 August 2026 · branch `claude/maritime-project-presentation-g9sphj` · head `b975eb0` · PR #1 (draft, open)

Read this first if you are picking the project up cold. It is the state of play,
the decisions already made, and what is left.

---

## 1. What this project is

A pre-sales package for the **Adani Mundra Port** prospect, prepared by Mobilise
App Lab. Three deliverables in one repo:

| Path | Deliverable |
|---|---|
| `portal/` | **Mundra Port Operations Portal** — a working MERN application (MongoDB · Express · React 18/Vite · MUI). 12 modules, RBAC, 3.6 years of seeded operational data. |
| `maritime-ai/` | **Sagar Drishti — Mundra Port AI Analytics** — FastAPI + React. The AI layer over the same data: findings engine, natural-language reports, RAG, 3D port twin, agent workforce. |
| `deck/`, `docs/`, `dist/` | The capability & delivery presentation (26-slide HTML deck, 34-slide PPTX, Part I–III dossier). |

The two portals are **independent applications that share one dataset**. There is
no runtime coupling: Sagar Drishti reads the operations portal's exported demo
snapshot at build time to generate its analytics panels.

---

## 2. Standing rules — do not break these

These have governed every decision so far and must continue to.

1. **Real infrastructure and public statistics are fine.** Berth names, terminal
   layout, channel depths, IPA/UNCTAD/Indian Ocean MoU benchmark figures — all
   real and sourced.
2. **Every transaction is fictional.** Port calls, agents, incidents, invoices,
   detentions, licences, crew — all invented demo data.
3. **Never attribute anything negative to a real company or vessel.** Eight real
   liner callers appear for schedule realism only (MSC Anna, APL Raffles, MSC Al
   Rawdah, Maersk Kensington, Maersk Chicago, CMA CGM Ural, ESL Wafa, Folk
   Jazan). They carry clean records, and code explicitly excludes them from
   incidents, inspections, billing and watchlists. Keep it that way.
4. **GSTINs are marked `(sample)`.**
5. **Do not follow the MALL SDLC skill for this work** — the user asked for
   direct execution, not the gated process.
6. Deployment target is the user's Mac via `docker compose`; domain-based hosting
   later, when they provide a domain.

---

## 3. Where the code lives

- **Repo:** https://github.com/mobiliseapplabllp/maritime-project-presentation
- **Branch:** `claude/maritime-project-presentation-g9sphj` (all work; never push elsewhere)
- **PR:** https://github.com/mobiliseapplabllp/maritime-project-presentation/pull/1 — draft, open, mergeable, no CI configured on this repo
- **User's local clone:** `/Users/ashish/Claude/Projects/maritime-project-presentation`
- **Shareable demo (operations portal only):** https://claude.ai/code/artifact/deb9a497-ceae-42ca-af5b-cc3765dd328f

**Careful:** there is an unrelated repo, `mobiliseapplabllp/PLI-Portal` (an internal
Performance Linked Incentive portal, MySQL/Sequelize). A cloud session was once
mis-scoped to it. Nothing maritime belongs there.

Sagar Drishti was forked from `mobiliseapplabllp/sodexo-htm-ai` (a healthcare-equipment
analytics platform, itself descended from *POSHAN Drishti*). That source repo was
read only, never modified.

### Commit history on the branch

| Commit | What |
|---|---|
| `b975eb0` | Sagar Drishti frontend re-domain — branding, terminals, Mundra twin, Gujarati |
| `5bdfc3d` | Sagar Drishti data pipeline, findings engine, backend |
| `961cbef` | v9 — seed 3.6 years of history across every module |
| `786f379` | v8 — 10 research-ranked features |
| `3e7b115` | v7 — security hardening + Dev/UAT/Prod environments |

---

## 4. Running everything

```bash
# Operations portal → http://localhost:5200
cd portal && docker compose up --build

# Sagar Drishti → http://localhost:5273 (API :8010, optional TTS :8020)
cd maritime-ai/portal && make install && make dev
```

Ports never collide, so both run at once.

**Logins**

| Portal | Users |
|---|---|
| Operations portal | see `portal/README.md` (super admin `admin@mundraport.in`) |
| Sagar Drishti | `harbour.master`, `head.container`, `tm.mict`, `hse.chief`, `finance`, `analyst` — all password `Mundra@2026` |

**AI features** use the local `claude` CLI over OAuth — no API key. Run `claude
login` once. Without it everything still works: 12 built-in chat intents answer
the common questions, TTS falls back to browser voices, RAG reports itself
unavailable. Nothing hard-fails.

---

## 5. Operations portal (`portal/`) — current state

Twelve modules: Harbour Operations (berth board, berth window planner, vessel
schedule, 2D quay twin, marine services, live traffic), Fleet Manager, Crew &
Manning, Notices & Circulars, Incident Desk, Survey & Audit Cell, Port Companies,
Revenue & Billing, MIS Reports (24-report library), Data Studio (19 masters),
Administration, plus Ctrl+K global search and a grounded AI assistant.

**Data (v9):** every module spans January 2023 → today.

- ~1,190 port calls across 44 months on a growth ramp (18–24/month in 2023 → 30–36 today)
- 762 invoices, 77 inspections, 401 incidents, 128 users, 31 vessels, 24 berths
- Seafarer sea-service walks back contract-by-contract to 2023; licences renew on
  rolled-forward 2-year cycles; every document series (MUN-, INS-, INC-, LIC-,
  MUN/INV/) numbers per-year
- Legislation carries dated history including a withdrawn Cyclone Biparjoy notice
  (June 2023) with a matching gap in June 2023 arrivals

All of it is generated by `portal/backend/scripts/seed.js` from a fixed PRNG seed —
deterministic and reproducible. `HIST_START` (Jan 2023) is the anchor constant.

**Verification bar this project holds to** (repeat it for any change):
`npm test && npm run test:api && npm run test:security` (26 tests), an eslint
`no-undef` sweep, both bundles building clean, and a Playwright drive against both
the live backend and the demo bundle.

**Demo bundle:** `VITE_DEMO=1` builds a browser-only version reading
`frontend/src/demo/snapshot.json`, wired through `frontend/src/api/demoClient.js`.
**Any backend feature must be mirrored in `demoClient.js`** or the shareable demo
silently loses it. Regenerate the snapshot with
`backend/scripts/export-demo.js` — and always from a **freshly reseeded** database,
because running the test suite first leaves residue (that shipped by accident in v8).

---

## 6. Sagar Drishti (`maritime-ai/`) — current state

**Read `maritime-ai/CONTRACT.md` before changing anything.** It is the domain
contract: hierarchy, panel names, every column, artifact names, branding,
accounts, agent names. `maritime-ai/.rekey-notes.md` is the full API key-rename
ledger from the fork.

**Hierarchy:** port → zone → terminal → berth (INMUN → 3 zones → 10 terminals →
24 berths). Scope strings: `port` | `zone:Container` | `terminal:MICT` | `berth:CT3-1`.

**Data pipeline** — run in this order after any portal reseed:

```bash
python3 maritime-ai/data/mundra/build_panels.py     # snapshot → tidy unit×month panels
python3 maritime-ai/analysis/analyze_mundra.py      # panels → findings + rankings + packs
python3 maritime-ai/data/geo_mundra/build_geo.py    # berth coords → terminal GeoJSON (rarely changes)
```

Four panels (`ops`, `marine`, `hse`, `revenue`) and eleven analysis artifacts,
including **15 findings** across operations efficiency, hotspots, HSE, prediction,
patterns, benchmark and revenue.

**Benchmarks** live in `data/ground_truth/major_ports_benchmark.csv` — real public
figures (turnaround, berth-day output, pre-berthing wait, PSC detention rate,
UNCTAD occupancy bands). These are what makes the analysis credible; keep them
sourced and honest.

**RAG library:** 20 documents → 61 BM25 chunks in `data/knowledge/`. Mix of the
portal's own circulars expanded into full documents, public-statute reference
summaries (clearly labelled as summaries, no fabricated quotations), and four
authored Mundra SOPs. Rebuild with `data/knowledge/curate_docs.py` then
`build_index.py`.

**Agent workforce:** Harbour Collector (rebuilds panels), Berth Sentinel (watches
waiting-time rises with EWMA learning), Marine Auditor, Berth Planner, Trade
Analyst, Duty Officer, plus Facts Curator / QA Examiner / QA Validator.

**3D twin** (`components/MundraTwin.jsx`): projection derives from the GeoJSON's
own geometry with no hardcoded bounds, centred on the mean of feature centroids —
**not** the bounding box, because the two SPM pads sit ~13 km offshore and a bbox
centre lands in open water, pushing every quay terminal into a corner. The default
camera is the shared `HOME_CAM` constant, used by both init and the deselect reset
so they cannot drift apart.

---

## 7. Gotchas — hard-won, read before debugging

**Environment**
- Backend restarts must be their **own short command**; bundling with slow curls
  gets the process group killed (nohup does not survive group SIGTERM).
- Never combine `pkill` with other commands in one shell call — it kills its own
  shell (exit 144). Run it alone with `|| true`.
- In the cloud sandbox, FerretDB and the Node backend both die between turns.
  Always check liveness and restart before verifying anything.
- Sandbox `cryptography` is broken (missing `_cffi_backend`); `pip install --user
  cryptography cffi` shadows it.

**Sagar Drishti**
- Backend must stay **Python 3.9-compatible** (`typing.Optional`, no `X | Y` in
  Pydantic models) — target is a Mac system Python.
- Always pass `--model` to the `claude` CLI; the local default may be broken.
  Prompts over 32KB go via temp file.
- Vite is pinned to 5273 (strictPort), backend 8010, TTS 8020.
- i18n: the **English string is the key**; missing translations fall back to
  English. Caches are keyed per language + element title, so renaming a card
  regenerates its explanation by design.

**React/UI**
- Controlled inputs ignore programmatic `.value=` — use the native setter plus an
  input event.
- Recharts screenshots race entry animations; verify via DOM, not pixels, and
  allow 3s+ before screenshotting or you catch a mid-fade overlay.
- Fragments inside `.map()` need `<Fragment key=…>`, not `<>`.
- Google Fonts is blocked in the sandbox — `ERR_CONNECTION_RESET` in console
  drives is expected noise, not a regression.

---

## 8. What is done, and what is open

**Done and pushed:** everything described above — both portals, all data, all
verification, PR body current.

**Open / next candidates** (none blocking, in rough priority order):

1. **Shareable Sagar Drishti demo.** The operations portal has one because its
   demo mode reads a bundled snapshot in-browser. Sagar Drishti needs its Python
   backend for chat, RAG, findings and agents. Two options were offered to the
   user and **not yet chosen**: (a) a read-only static build keeping dashboards,
   Port Explorer and the twin from a baked snapshot, dropping live AI; or (b)
   real hosting when a domain is available.
2. **Domain hosting** for both portals — `portal/DEPLOYMENT.md` already documents
   Dev/UAT/Prod compose files, nginx TLS and certbot. Waiting on a domain.
3. **The v8 feature backlog** — a research pass ranked 60 features and built the
   top 10. The other 50 are catalogued in the "Feature Radar" artifact from that
   session, grouped by module.
4. **Optional Sagar Drishti pieces not installed here:** neural TTS voices need a
   Python 3.11 venv plus `brew install espeak-ng` for Hindi (see
   `maritime-ai/portal/README.md`); Gujarati falls back to browser TTS.

**Known cosmetic item:** a 401 from `/api/tts/status` appears in the console when
the TTS sidecar is not running. Harmless.

---

## 9. Working agreements with this user

- They want **working software, verified**, not plans — build it, prove it with
  tests and a real browser drive, then report.
- Show screenshots of what actually runs.
- They review on GitHub and pull to their Mac, so **commit and push promptly**;
  the cloud container is ephemeral and unpushed work is at risk.
- Keep the two products' data in one shared fictional world — that consistency is
  a selling point of the package.
