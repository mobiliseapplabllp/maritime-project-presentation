# Part I — Platform Capability Model

Seven operating domains, five capability spines, and an honest four-tier statement of what
"already built" means.

> **Marking discipline.** Every capability below carries one of four tiers. Before this document is
> issued, a named engineer must confirm each `Core` marking against a running system — see
> `00-claims-and-evidence.md` item B1. Anything that cannot be demonstrated live is demoted.

| Tier | Definition | Lead time |
|---|---|---|
| `Core` | Exists and runs today. Client work is migration and acceptance. | — |
| `Configure` | Changed by an administrator through the console. No release, no developer. | Hours–days |
| `Extend` | Built on documented extension points — APIs, connectors, rule modules — without forking the core. | Weeks |
| `Build` | Genuinely new. Estimated, scheduled and priced as new development. | Sprint-scoped |

---

## The structural argument

A maritime administration is organised by **domain** — a Ships department, a Seafarers department,
a licensing function. But work does not flow that way. A single vessel touches registration, risk
assessment, position tracking, port clearance and survey inside one lifecycle, and each touch
depends on data owned by a different department.

So the platform is **built on the spines and presented as the domains**. Departments see their own
service catalogue; underneath, one registry identity, one risk engine, one workflow engine, one
audit ledger, one document store. This is what makes the compounding effects in the sections below
possible — a poor ship manager automatically raising the risk profile of every vessel it manages,
for instance — and it is not achievable if each department gets its own system.

### Capability map

| Domain | Registration & certification | Compliance & risk | Vessel tracking | Port & terminal ops | Inspection & survey | Tier |
|---|---|---|---|---|---|---|
| Ships | ● primary | ● primary | ◐ feeds | ◐ feeds | ● primary | `Core` |
| Seafarers | ● primary | ● primary | ○ | ◐ crew lists | ◐ MLC audit | `Core` |
| Legislation & circulars | ◐ rules | ● primary | ○ | ◐ rules | ● checklists | `Core` |
| National Maritime Centre | ○ | ● primary | ● primary | ◐ calls | ◐ casualty | `Configure` |
| Smart inspection & audit | ◐ endorses | ● primary | ◐ targeting | ◐ at berth | ● primary | `Core` |
| Ports | ○ | ◐ clearance | ● primary | ● primary | ◐ at berth | `Extend` |
| Maritime facilities & companies | ● primary | ● primary | ○ | ◐ facilities | ● audit | `Core` |

---

## Domain 01 — Ships

The registry is the system of record. Every other domain resolves back to a ship identity, so
registry quality is the ceiling on everything else.

| Service | Covers | Tier |
|---|---|---|
| Registration | Provisional, permanent, bareboat-in, bareboat-out, under-construction, re-registration, change of ownership or name, deletion and closure of registry | `Core` |
| Ship identity | IMO number, official number, call sign, MMSI, port of registry, tonnage under ITC 69, class linkage to the IACS society | `Core` |
| Title & encumbrance | Mortgage registration, priority ranking, transfer and discharge; arrest, detention and caveat flags visible to every downstream service | `Core` |
| Statutory certificates | SOLAS (SAFCON, safety equipment, safety radio), MARPOL (IOPP, ISPP, IAPP, IEE), Load Line, Tonnage, ISM (DOC/SMC), ISPS (ISSC), MLC, BWM, AFS, and the liability set (CLC, Bunker, Wreck Removal, PAL) | `Core` |
| Small craft register | Dhows, abras, leisure yachts, fishing and workboats on a lighter register with its own fee and survey rules | `Configure` |
| Radio & CSR | MMSI and EPIRB assignment, ship station licence, Continuous Synopsis Record with full history chain | `Configure` |
| RO delegation | Which survey each Recognised Organisation may perform on the administration's behalf, with performance tracked against the delegation | `Core` |

### The certificate matrix

Ship type, gross tonnage, trading area and convention applicability together determine which
certificates a vessel must carry. The platform **derives** that set rather than relying on a clerk
to remember it, then holds the HSSC survey windows against it:

- anniversary-date harmonisation across all statutory certificates
- window states — annual, intermediate, renewal — with the ±3 month rule applied
- short-term extensions with their justification held on the record
- conflict detection when an RO endorsement lands outside its permitted window

**Why it matters.** A ship detained abroad on a certificate defect is a flag-state performance
event that follows the administration into MoU statistics. The registry that computes the matrix is
the registry that stops the defect leaving port.

---

## Domain 02 — Seafarers

STCW competency, sea service, medical fitness and MLC entitlements are usually four disconnected
systems. Held as one identity they cross-validate each other, and certificate fraud stops being
invisible.

**Competency & certification** `Core` — Certificates of Competency and Proficiency under STCW 2010
as amended; GMDSS operator certificates and radio endorsements; Certificates of Recognition
(flag endorsement of foreign CoCs, with issuing-administration verification); revalidation, upgrade
paths and gap analysis against the STCW table.

**Service & identity** `Core` — Seafarer Identity Document and Continuous Discharge Book issue and
replacement; sea-service records validated against vessel movement history and crew lists rather
than against the applicant's own declaration alone; medical fitness certificates and approved-examiner
register; biometric enrolment where national identity policy requires it `Extend`.

**Training & employment** `Core` — Maritime training institute accreditation, course approval and
audit against approved syllabus; examination and assessment scheduling, assessor rostering, result
capture; manning agency licensing and periodic inspection; MLC 2006 employment agreements, wage
records, repatriation cover, and on-board complaint escalation to the administration.

**Manning closes the loop.** The Minimum Safe Manning Document issued against a ship in Domain 01
is enforced against the crew list in Domain 06 and checked by the inspector in Domain 05 — the same
three records read three ways, which is only possible if they are one record.

---

## Domain 03 — Legislation & Circulars

Most administrations publish circulars as documents, then re-type their content into checklists,
forms and fee tables by hand. Holding the instrument base as **structured data** means a change
propagates instead of being re-keyed — and you can prove to an auditor that it did.

| Capability | Detail | Tier |
|---|---|---|
| Instrument base | Maritime law, ministerial resolutions, technical and marine notices, circulars | `Core` |
| Bilingual parallel text | Arabic and English as one instrument with two renderings, not two documents | `Core` |
| Version chains | Effective dates, amendment and supersession links, point-in-time retrieval | `Core` |
| Publication | Public portal, subscription alerts, public-consultation workflow | `Core` |
| Convention adoption tracking | IMO instrument → national instrument → procedure → checklist item | `Core` |

### The traceability chain

```
IMO instrument            MARPOL Annex VI Reg. 14 — sulphur content of fuel oil
        │
        ▼
National instrument       Ministerial Resolution — adopting article, effective date, penalties
        │
        ▼
Administrative procedure  Surveyor SOP — bunker delivery note retention, sampling method
        │
        ▼
Checklist item            PSC deficiency code · photo · sample seal no. · officer · timestamp
        │
        ▼
Inspection evidence       queryable end to end, in one query
```

**IMSAS readiness.** The IMO Member State Audit Scheme asks a state to demonstrate that adopted
conventions are implemented and enforced. That is exactly this chain — queryable, with evidence
attached at every link, rather than assembled by hand in the weeks before an audit.

---

## Domain 04 — National Maritime Centre

`Configure` — the case-management, mapping, fusion and alerting substrate is core. What is
configuration is the sensor inventory, geofence set, escalation matrix and agency access model.
What is genuine integration work is each upstream feed, scoped per phase in
`02-delivery-confidence.md`.

**Domain awareness** — terrestrial and satellite AIS, LRIT, VMS and coastal radar fused into one
track store; VTS interoperability at national and port level; geofences for territorial sea,
anchorages, marine protected areas, exclusion and security zones; a common operating picture shared
to coast guard, customs and environment agencies under role-scoped access.

**Incident & SAR** — MRCC incident log, distress alert intake, asset tasking and on-scene
coordination; incident timelines reconstructed from track history rather than recollection;
inter-agency escalation matrix with duty rosters; after-action pack generated from the log.

**Casualty & pollution** — marine casualty investigation under the Casualty Investigation Code with
case file, evidence chain and safety recommendations; pollution response under OPRC with tiered
activation; GISIS-compatible casualty reporting. **Findings feed back into the risk model and the
inspection checklist** — which is the point of holding them in the same platform.

**Maritime security** — ISPS security level declaration and propagation to port facilities; ship
security alert handling; port facility security assessment and plan approval status on the map;
sanctions and watchlist correlation against live tracks.

---

## Domain 05 — Smart Inspection & Audit

Inspection capacity is fixed; arrivals are not. The entire discipline is **targeting** — computing
a defensible risk profile, spending scarce surveyor hours against it, and justifying the selection
afterwards.

| Regime | What the platform runs | Tier |
|---|---|---|
| Flag State Inspection | Annual and ad-hoc FSI programme, surveyor assignment, findings, corrective action to closure | `Core` |
| Port State Control | Targeting under Riyadh MoU methodology, initial and more-detailed inspection, deficiency coding, detention decision, rectification and follow-up | `Core` |
| ISM audit | DOC and SMC — initial, annual, intermediate, renewal; major non-conformity handling | `Core` |
| ISPS audit | ISSC verification; port facility security audits against the approved plan | `Core` |
| MLC inspection | DMLC Parts I and II, on-board conditions, complaint-triggered inspection | `Core` |
| Oversight audits | ROs against delegation, training institutes against syllabus, licensed facilities against condition | `Core` |
| IMSAS evidence | Standing evidence library mapped to the audit standard | `Configure` |

### Field-first, offline-first

The inspector's device is the primary interface — not a web form retyped at the office at 19:00.

- **offline capture** with conflict-safe sync on reconnect
- photo and video evidence bound to the checklist item and geotagged
- **deficiency code suggested** from photo and field note — the officer confirms, the system never auto-files
- report and detention justification **drafted against convention references** before the surveyor leaves the gangway
- electronic signature and immediate issue to the master

If the app is not faster than the paper form on day one, it has failed. That is the acceptance
standard, and it is written into Phase 2 of the roadmap.

---

## Domain 06 — Ports

`Extend`. Declaration handling, workflow, clearance and the tariff engine are core. The extension
is the client's specific agency clearance rules and the terminal systems in scope — genuine work,
which we price rather than describe as a switch.

**Maritime Single Window.** Since 1 January 2024 the FAL Convention has made electronic exchange of
port-call data mandatory for Contracting Governments. This is a treaty obligation with a date that
has already passed, not a modernisation option.

- FAL Forms 1–7 — general declaration, cargo, ship's stores, crew effects, crew list, passenger list, dangerous goods
- aligned to the **IMO Compendium** harmonised data model, so submissions are reusable rather than port-specific
- **once-only principle** — the agent submits once; customs, immigration, health, security and the port each read their slice
- machine-to-machine API for agents and lines alongside the web channel

**Port call lifecycle** — pre-arrival notification and ETA management, berth allocation and conflict
resolution, pilotage/towage/mooring ordering, arrival, shifting and departure clearance, waste
reception and delivery receipt.

**Terminal operations** `Extend` — gate, yard and berth for container, bulk and ro-ro; crane moves
per hour and berth productivity; equipment and gang deployment. We interoperate with the incumbent
TOS rather than proposing to replace it.

**Revenue** `Configure` — configurable tariff engine for port dues, berth hire, pilotage, tug and
waste; automatic assessment from the call record; invoicing, payment gateway, dispute handling;
concession and lease revenue tracking.

**Safety & performance** — IMDG dangerous-goods declaration and approval; under-keel clearance and
tidal window checks; port performance indicators on the UNCTAD/World Bank basis; waiting time,
turnaround and dwell measured rather than estimated.

---

## Domain 07 — Maritime Facilities & Companies

Every licence type differs in its eligibility test, its documents and its inspection — and is
identical in its lifecycle. One configurable lifecycle, with each licence type expressed as data,
is the difference between adding a licence type in a fortnight and adding one in a release.

| Licensed entity | Regulated because | Renewal* |
|---|---|---|
| Shipping agencies | Act for the owner in port-call and clearance submissions | Annual |
| Ship management companies | Hold the Document of Compliance; ISM-accountable | Annual |
| Manning agencies | MLC 2006 recruitment and placement obligations | Annual |
| Bunker suppliers | MARPOL Annex VI fuel quality and delivery notes | Annual |
| Ship repair yards & dry docks | Hot work, safety case, hazardous waste, recycling | 2 years |
| Marinas & jetties | Facility safety, berth capacity, small-craft registry linkage | 2 years |
| Diving & marine contractors | Underwater operations and permit-to-work | Annual |
| Marine surveyors & consultants | Issue reports the administration relies on | 2 years |
| Recognised Organisations | Exercise delegated statutory authority | By agreement |
| Training institutes | Deliver STCW-approved courses | 3 years |
| ISPS port facilities | Statement of Compliance against approved security plan | 5 years |

\* **Illustrative defaults only** — replace with the client's actual renewal periods before issue.
See `00-claims-and-evidence.md` item C9.

**One lifecycle, configured per type** — apply (document set per licence type, not hard-coded) →
screen (completeness and eligibility against the licence matrix) → evaluate (technical assessment
routed by competency) → inspect (into the same field app as Domain 05) → issue (licence with
conditions, scope, validity) → supervise (periodic audit, complaints, performance rating) → enforce
(warning, condition, suspension, revocation, penalty).

**The compounding effect.** A licensed company's audit history feeds the ship risk profile of every
vessel it manages. A poor manager makes its fleet a targeting priority automatically — which is
what a risk-based administration is supposed to do, and what separate departmental systems cannot
do at all.

---

## Cross-cutting spine — Compliance & Risk

Targeting only works if the score is explainable. Every ship carries a live profile assembled from
factors the administration controls, each weighted, versioned, and traceable to the record that
produced it.

| Factor | Source | Weight | Direction |
|---|---|---|---|
| Detention history | PSC records, own and MoU-exchanged | High | Recency-decayed |
| Deficiency density | Deficiencies per inspection, last 36 months | High | Rising = worse |
| Company performance | DoC holder's fleet record (Domain 07) | High | Fleet-wide |
| RO performance | Detention rate on the surveying society's certificates | Medium | Fleet-wide |
| Ship age & type | Registry (Domain 01) | Medium | Type-banded |
| Certificate status | Live certificate matrix, overdue survey windows | Medium | Binary escalation |
| Casualty involvement | Casualty and incident file (Domain 04) | Medium | Recency-decayed |
| Time since last inspection | Inspection ledger (Domain 05) | Medium | Rising |
| Behavioural anomaly | AIS gaps, spoofing, STS patterns | Emerging | **Advisory only** |
| Sanctions exposure | Ownership chain vs UN, OFAC, EU lists | Override | Escalate to review |

**Non-negotiable properties.** *Explainable* — every score opens to its factor breakdown and the
underlying record; no opaque model output drives a boarding decision. *Versioned* — a weighting
change is an event with an author and a date, and yesterday's selection is reproducible under
yesterday's model. *Simulated before adopted* — change weights, replay twelve months of arrivals,
see what would have been targeted and what missed, before it goes live. *Advisory where it must be*
— behavioural signals raise attention and never, alone, produce a detention.

**Where AI sits.** Not in setting the weights — those are policy. In noticing what the weights are
missing: deficiency clustering by ship type, yard of build or trade route that nobody thought to
encode. Proposed to a human, adopted by a human.

---

## Cross-cutting spine — Vessel Tracking

Every administration can display AIS. The value is the **join**: this track belongs to a ship whose
ISM certificate lapses in eleven days, managed by a company under audit, carrying a crew list with
two unverified endorsements — and it is inbound to your anchorage.

**Sources fused** — terrestrial AIS, satellite AIS, LRIT via the national data centre, VMS for the
fishing fleet, coastal and port radar, VTS feeds, and optical/SAR satellite tasking where procured.

**Derived signals** — AIS gaps inconsistent with known coverage; spoofing indicated by implausible
kinematics, position jumps or MMSI identity collision; ship-to-ship transfer inferred from paired
loitering outside designated areas; geofence entry, exit and dwell; deviation from declared voyage
plan; anchorage congestion and waiting-time build-up.

**Joined to** — registry identity and certificate matrix, detention and deficiency history, crew
list and manning compliance, owner/manager/sanctions screening, the declared port call and FAL
submission, and the targeting list in real time as the vessel closes.

> **An honest limit.** AIS is self-reported and can be switched off or falsified; satellite AIS has
> revisit gaps; SAR tasking costs money per scene. We design for corroboration across sources and
> surface confidence on every derived signal rather than presenting a track as ground truth. An
> administration that acts on a single unverified source will eventually board the wrong ship.

---

## Standards the platform is built against

**Convention & regulatory** — SOLAS; MARPOL Annexes I–VI; STCW 2010 as amended; MLC 2006; ISM Code;
ISPS Code; Load Line; Tonnage 69; COLREG; BWM; AFS; Hong Kong recycling; FAL Convention.

**Data & exchange** — IMO Compendium on Facilitation and Electronic Business; IMO Reference Data
Model; GISIS ship, casualty and company reporting; Riyadh MoU inspection data exchange with
reciprocity to Indian Ocean, Paris and Tokyo MoUs; LRIT data centre interface; ITU-R M.1371 AIS
message decoding; S-100/S-57 hydrographic data; OGC WMS/WFS.

**Assurance & governance** — III Code and IMSAS; ISO/IEC 27001; ISO 22301; OWASP ASVS and Top 10;
WCAG 2.2 AA on public channels; the host state's data-residency and personal-data law; national
digital-government service and identity standards; NIST AI RMF as the frame for AI governance.

> Read as a commitment, not a certificate. Where an item is an accreditation the delivered system
> must hold, certification is achieved during delivery against the deployed system and the programme
> plan carries the milestone. Vendor-level claims carry their evidence status in
> `00-claims-and-evidence.md`.
