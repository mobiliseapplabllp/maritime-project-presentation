# Part III — AI-Native Platform & Agentic Orchestration

Agent specifications, orchestration model, autonomy tiers, guardrails and audit design.

> **Status.** Everything in this document is **DESIGN INTENT** — specifications, not deployed
> agents. No agent described here should be presented to a client as running in production. See
> `00-claims-and-evidence.md` section E.

---

## 1. What "AI-native" means here

Bolted-on AI adds a chat box beside the queue. AI-native changes what arrives on the officer's
desk: not an application to process, but a dossier already read, cross-checked, sourced and
flagged — with the decision left, deliberately, to the officer.

| Bolted on | AI-native |
|---|---|
| Answers questions *about* the process; does no part of it | An application enters the queue **already assessed** — documents read, entities extracted, registry cross-checked, gaps listed |
| Reads a knowledge base, not the live case record | Reads the live case record through the same governed APIs the officer's screen uses |
| Cannot act, so its accuracy is never tested by consequence | Acts, so accuracy is observable and measured continuously |
| Officer workload unchanged — the queue is the same length tomorrow | The officer's first action is a judgement, not thirty minutes of assembly |
| Impressive in the demonstration, unused by month four | Load-bearing, and therefore maintained |

### Three design commitments

**Grounded, not generative.** Regulatory outputs are produced against the instrument base and the
case record with mandatory citation. An assertion with no source is a defect and is treated as one
— suppressed and logged, not shown with a hedge.

**Deterministic where determinism belongs.** Fee calculation, certificate applicability and risk
weighting are rules, not inference. Agents read, reason and draft. They do not compute what a rule
engine should compute — that would be slower, more expensive and less correct.

**Bilingual throughout.** Arabic and English are equal citizens in the instrument base, in agent
reasoning, in generated circulars and in the citizen assistant. Not an English system with a
translation layer bolted to the front.

---

## 2. Architecture

```
CHANNELS      public portal · officer workspace · inspector mobile · NMC ops · M2M API · assistant
                                          │
EXPERIENCE    API gateway · session & consent · rate limiting · bilingual rendering
                                          │
AGENTIC       ┌ planner / supervisor ─── specialist mesh (10) ─── verifier / critic ┐
LAYER         └ tool gateway ─────────── grounding & citations ─── policy guardrails ┘
                                          │
DOMAIN        registry · seafarer · instrument base · maritime centre · inspection ·
SERVICES      port & single window · licensing │ risk · workflow · documents · payments ·
                                                 identity & RBAC · notifications
                                          │
DATA          operational store · track store · object store · event bus ·
                                  IMMUTABLE AUDIT LEDGER · warehouse
                                          │
EXTERNAL      GISIS · Riyadh MoU · IACS/ROs · national SSO · customs & immigration · satellite AIS/LRIT
```

**The critical structural decision:** agents hold **no privileged data path**. They call the same
governed APIs the officer's screen calls, through the same authorisation, into the same audit
ledger. There is no shadow route to the registry. This single constraint is what makes the tiers in
section 4 enforceable rather than aspirational — an agent cannot exceed its authority because the
tool it would need is not exposed to it.

---

## 3. The agent mesh

One general-purpose assistant across a maritime administration is ungovernable — it cannot be
audited, tiered, or demoted. Ten narrow agents can each be measured, evidenced and promoted
independently, and one underperforming agent does not take the programme with it.

### 01 — Registry Agent · Domain 01 · launch Tier 1

Reads builder's certificate, bill of sale, deletion certificate from prior flag, tonnage
measurement and class documents. Extracts and validates ship particulars. Cross-checks IMO number
and prior flag. Walks the ownership chain and screens beneficial owners against UN, OFAC and EU
lists. Returns a decision-ready dossier with every gap explicitly named.

*Tools:* registry read, document store read, OCR/extraction, external ship database lookup,
sanctions screening. *Cannot:* write a registry record, issue a certificate.

### 02 — Certification Agent · Domain 01 · launch Tier 1

Derives the statutory certificate set from vessel type, tonnage and trading area. Holds HSSC survey
windows against it. Opens renewal tasks ahead of expiry. Detects RO endorsements landing outside
their permitted window and certificate/survey harmonisation conflicts.

*Tools:* registry read, certificate matrix rules engine, task creation, notification.
*Cannot:* issue, endorse, extend or withdraw a certificate.

### 03 — Risk & Targeting Agent · Domain 05 · launch Tier 2

Recomputes ship risk profiles as new evidence arrives. Produces the daily targeting list against
expected arrivals. Explains every placement by factor. Proposes weighting changes accompanied by a
twelve-month backtest — and never applies them itself.

*Tools:* risk engine read, inspection ledger read, arrivals feed, backtest simulation.
*Cannot:* change a weighting, order an inspection, detain.

### 04 — Inspection Copilot · Domain 05 · launch Tier 1

Briefs the surveyor before boarding on this ship's history and its sister vessels' recurring
deficiencies. Suggests deficiency codes from photograph and field note. Drafts the inspection report
and, where applicable, the detention justification against specific convention references.

*Tools:* inspection ledger read, registry read, instrument base retrieval, vision analysis, draft
creation. *Cannot:* file a deficiency, sign a report, issue or lift a detention.

### 05 — Regulatory Intelligence Agent · Domain 03 · launch Tier 2

Watches IMO, MoU and class circular feeds. Diffs each change against the national instrument base.
Produces the downstream impact list — which checklists, forms, fee tables and system rules must
change. Drafts the national circular in Arabic and English for legal review.

*Tools:* external feed read, instrument base read, impact traversal, bilingual draft creation.
*Cannot:* publish an instrument, amend a checklist, change a fee.

### 06 — Seafarer Verification Agent · Domain 02 · launch Tier 1

Validates certificate authenticity with the issuing administration. Tests declared sea service
against vessel movement history and crew lists — not against the applicant's own declaration.
Detects document tampering. Runs STCW gap analysis before an endorsement is issued.

*Tools:* seafarer record read, external administration verification, track store read, crew list
read, document forensics. *Cannot:* issue an endorsement, reject an application.

### 07 — Port Call Orchestrator · Domain 06 · launch Tier 1

Reconciles FAL declarations across agent, customs, immigration and health submissions. Catches
missing or contradictory data before arrival rather than at the berth. Predicts berth and resource
conflicts. Proposes pilot, tug and berth sequencing.

*Tools:* port call read, FAL submission read, berth and resource schedule read, ETA prediction.
*Cannot:* grant clearance, allocate a berth, release a vessel.

### 08 — Maritime Domain Awareness Agent · Domain 04 · launch **Tier 3**

Scores AIS gaps, spoofing indicators, ship-to-ship transfers and voyage deviation. Corroborates
across terrestrial, satellite and radar sources. Raises attention with a stated confidence.

**Launches at Tier 3 deliberately** — its signals are probabilistic and its consequences are
enforcement actions against real vessels and crews. It informs the file; it never produces a
finding.

*Tools:* track store read, registry read, geofence evaluation, anomaly scoring. *Cannot:* task an
asset, alert an external agency, initiate any enforcement action.

### 09 — Licensing Agent · Domain 07 · launch Tier 1

Tests application completeness and eligibility against the licence matrix. Schedules the inspection.
Drafts the technical evaluation. Tracks conditions and prompts renewal before lapse.

*Tools:* licence record read, licence matrix rules, inspection scheduling, draft creation.
*Cannot:* issue, condition, suspend or revoke a licence.

### 10 — Service Assistant · all domains · launch Tier 0/1

The bilingual front door for owners, agents, seafarers and companies. Explains requirements,
pre-fills forms from records already held, answers status queries, escalates to a named officer with
full context attached.

*Tools:* public service catalogue, own-record read scoped to the authenticated user, form pre-fill,
escalation. *Cannot:* read enforcement files, read another party's records, submit an application
on the user's behalf without explicit confirmation.

---

## 4. Orchestration

**Planner / supervisor.** Decomposes a request into a plan with explicit verification steps before
any specialist runs. The plan itself is logged — so a wrong outcome can be traced to a wrong plan
rather than being attributed vaguely to "the AI".

**Specialist execution.** Each agent runs against its own allow-listed tools. Scope is enforced at
the gateway, not requested in a prompt — a prompt-injection payload in an uploaded document cannot
reach a tool the agent was never granted.

**Verifier / critic.** Attacks the result before any human sees it: are all assertions cited? Do
the citations support what they are attached to? Is anything asserted that the record does not
contain? Disagreement between specialist and verifier is **surfaced to the officer**, not resolved
silently.

**Human handoff.** What reaches the officer is the output, its citations, its confidence, its stated
uncertainties, and any specialist/verifier disagreement.

---

## 5. Autonomy tiers

"Human in the loop" is a slogan until you say which loop and which human. These are technical
settings on each agent, enforced by tool exposure at the gateway.

| Tier | Meaning | Applies to | Reversal |
|---|---|---|---|
| **0 — Autonomous** | Acts without review. Reversible, non-consequential, fully verifiable. | Status lookups, notifications, expiry reminders, document classification and filing, data-quality flagging | Automatic, no consequence |
| **1 — Drafts** | Produces the complete output; nothing takes effect until a named officer signs. | Registration dossiers, inspection reports and deficiency codes, licence technical evaluations, bilingual circular drafts | Reject the draft — nothing has happened |
| **2 — Advises** | Assembles and argues; does not draft the decision. The officer's reasoning is the record. | Targeting recommendations, risk-weighting proposals, regulatory impact assessments, anomaly escalations | Not applicable — the human decided |
| **3 — Excluded** | Never AI-determined. AI may inform the file; it may not produce the finding. | Detention and release, licence suspension or revocation, casualty investigation findings, prosecution and penalty, certificate withdrawal | The tool is not exposed to the agent |

**Promotion is earned.** An agent enters service at its launch tier. Moving from Tier 1 to Tier 0
requires a defined volume of decisions at a measured accuracy threshold, reviewed by the client's AI
governance board, recorded as a versioned change. **Accuracy falling below the threshold demotes the
agent automatically** — promotion is a decision, demotion is a mechanism.

**Tier 3 is a floor, not a starting position.** These exclusions are proposed as permanent. If the
client's legal framework requires more in Tier 3, that is a configuration change, and it should be
made before go-live rather than debated afterwards.

---

## 6. Trust, audit and guardrails

A maritime administration is auditable by the IMO, by its own state audit office, and eventually by
a tribunal. An AI action that cannot be reconstructed two years later is not usable in that setting.
So the ledger is designed first and the agent second.

### Written on every agent action

| Field | Why it is there |
|---|---|
| Agent, version, tier | Which agent acted, under which released configuration, at what authority |
| Model and prompt fingerprint | Reproducibility — same inputs re-runnable against the same model version |
| Inputs consulted | Every record, document and instrument actually read, by identifier and version |
| Tool calls made | Each governed API call with parameters and result — the complete action trail |
| Citations | The specific clause, record or precedent behind each assertion |
| Confidence and uncertainty | What the agent was unsure of, stated at the time, not reconstructed later |
| Human disposition | Who reviewed, what they changed, accepted or rejected, and why |
| Outcome linkage | What eventually happened — what makes accuracy measurable rather than asserted |

### Guardrails

- **Citation is mandatory.** An unsourced assertion is suppressed and logged as a defect.
- **Tool allow-lists at the gateway.** Prompt injection cannot reach an ungranted tool.
- **Untrusted content is fenced.** Applicant documents, external feeds and correspondence are data
  to be analysed, never instructions to be followed.
- **PII minimised at the boundary.** Redaction before any external model call; classification-driven
  routing keeps sensitive cases on the in-country path.
- **Deterministic fallback.** Every agent has a defined degraded mode. Model unavailability slows
  the administration; it never stops it.

### The metric that matters

**Officer rejection rate.** Officers rejecting agent drafts is the honest signal of quality. It is
instrumented from day one, reported to the client's governance board, and a rising rate is treated
as a defect in the agent — not as resistance from the officer.

---

## 7. Modelled impact

All figures are **MODELLED** — derived from task decomposition, not measured in a prior deployment.
The baseline column is a placeholder until the client's real timings are measured in week 0.

| Process | Where the time goes today | What the agent removes | Modelled |
|---|---|---|---|
| Ship registration | Document reading and re-keying; chasing missing papers; manual ownership and sanctions checks; file assembly | Extraction, cross-checking, gap listing, dossier assembly | −50 to 70% handling time |
| Certificate renewal | Manual expiry tracking across a fleet; late discovery of lapses; reactive chasing | Derived matrix, window monitoring, tasks opened before expiry | Lapses → near zero |
| PSC inspection | Pre-boarding research; on-board note-taking; report typed at the office; code lookup | Briefing pack, on-device capture, code suggestion, report drafted before disembarking | −40 to 60% report time |
| Inspection targeting | Manual list-building; targeting what is visible rather than what is risky | Continuous recomputation against live arrivals, selection explained | Deficiency hit-rate ↑ |
| Seafarer endorsement | Manual verification with issuing administrations; sea service checked against self-declaration | Automated verification against vessel movements and crew lists | −50 to 65% cycle time |
| Port call clearance | Same data submitted repeatedly to separate agencies; errors surfacing at the berth | Once-only submission; contradictions caught pre-arrival | −60 to 80% submissions |
| Circular issuance | Manual impact analysis across checklists and forms; bilingual drafting and review | Impact list from the instrument chain; bilingual draft for legal review | Weeks → days |

> **Interrogate the middle column, not the last one.** Any supplier can print a percentage. The
> question worth asking is whether the described task actually decomposes the way column three
> claims. If it does not, the number is worthless.

These become **commitments in Phase 0**: week 0 measures the real baseline, week 8 measures the same
process on the platform. From that point the numbers stop being modelled and start being observed —
and can be written into the contract.
