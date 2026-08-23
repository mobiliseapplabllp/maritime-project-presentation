# Part II — Delivery Confidence

Written as tender-response prose. This is the section a maritime administration's evaluation panel
scores hardest, and the section where suppliers most often lose a bid by overstating.

---

## 1. The position, stated plainly

Mobilise App Lab has **not previously delivered a national flag-state registry or a Maritime Single
Window in production**, and holds **no maritime-authority reference available for a diligence call
today**.

We state this first, unprompted, for a practical reason. A maritime administration verifies
references — it is a regulator, verification is what it does. A claim that evaporates under
diligence does not merely weaken a bid; in most public procurement frameworks it is grounds for
disqualification and, in some, for exclusion from future tenders.

So the case below is built entirely from things an evaluator can check.

---

## 2. What can be proven today

### 2.1 Gated delivery process

Delivery runs through sequential gates — requirements, UI/UX, technical design, build, code review,
QA, security assessment, release — each producing artefacts, each closed before the next opens. The
process is documented and enforced rather than aspirational, and we will walk an evaluator through
the gate artefacts of a real project.

*Evidence to attach: the written process document; gate artefacts from a completed project.*

### 2.2 Security inside the gate, not after it

The security assessment is a gate, not a pre-release afterthought: OWASP-aligned review, SAST and
DAST in the pipeline, and penetration testing before release.

*Evidence to attach: redacted scan output; penetration-test certificate.*

### 2.3 Production systems with the relevant structural properties

Systems in service today carry multi-role approval chains with segregation of duties, statutory
calculation producing legally consequential figures, immutable audit trails with before-and-after
snapshots, and regulated document output.

*Evidence to attach: named systems, subject to client consent; a live screen-share of the audit
trail and approval chain.*

### 2.4 The design work in this dossier

The reference architecture, domain model, capability marking, agent specifications, autonomy tiers
and audit design are reviewable **now**, before the administration spends anything. Design quality
is itself evidence — it is the part of a supplier's capability that is visible before contract.

---

## 3. Why this experience transfers

A maritime registry is, structurally, a regulated multi-party workflow system. The domain knowledge
is specific; the engineering shapes are not.

| Property required by a maritime administration | Where the same shape already appears |
|---|---|
| Multi-party, multi-stage approval with segregation of duties | Registration, licensing and certification workflows |
| Immutable audit of every state change, with before/after snapshots | The requirement an administration cannot compromise on |
| Rule-driven calculation producing a legally consequential number | Tonnage, fees, tariffs, risk scores |
| Controlled document generation with versioning and revocation | Certificate issue and withdrawal |
| Role-scoped access spanning organisations | Agencies, Recognised Organisations, inter-agency clearance |
| Time-bounded obligations with escalation | Survey windows, licence renewals, SLA clocks |

What does **not** transfer, and what we therefore buy in rather than claim: maritime regulatory
depth. The programme carries a named maritime domain adviser — a former surveyor or registrar —
from Phase 0, and their review is a gate condition, not a courtesy.

---

## 4. The proof of capability

Rather than ask the administration to believe a case study, we propose it watches us build.

**Eight weeks. One service of the client's choosing. The client's own data. The client's own
environment. Exit criteria written and signed by the client before week 1.**

| Weeks | Stage | Produced | What the client can check |
|---|---|---|---|
| 1–2 | Service catalogue & fit | The full service list marked Core/Configure/Extend/Build; target-state process for the chosen service; data-quality assessment of source records | Whether we understood the regulation, or only its vocabulary |
| 3–4 | Configure the core | The chosen service standing up on the configured platform — forms, workflow, roles, fees, documents, bilingual labels — with no bespoke code | Exactly how much is configuration, measured rather than asserted |
| 5–6 | Real data & integration | Migration of a representative record set; one live integration; the audit ledger populated with real transactions | Whether legacy data survives contact with a modern data model |
| 7 | Agent on the service | One agent in Tier 1 — drafting for officer approval, every output cited, nothing auto-executed | Whether the AI claim is substantive or decorative |
| 8 | Assessment | Officer-run acceptance against the client's criteria; security scan results; measured cycle time against the pre-pilot baseline; full-programme estimate grounded in observed velocity | Everything at once, against criteria written in week 0 |

**Terms that make this credible rather than a sales device:**

- **The client keeps the output.** Configuration, migrated data, integration code and documentation
  transfer at the end of week 8 whether or not the programme proceeds.
- **The client writes the test.** Exit criteria signed before week 1. We do not mark our own work,
  and we do not move the line in week 7.
- **Recommended first service:** small-craft registration, or a single PSC inspection flow. High
  volume, well-bounded, politically low-risk, and touching every layer of the architecture — it
  exercises the platform honestly rather than flattering it.

---

## 5. Programme roadmap

Sequenced so value lands before the hard integrations. The registry comes first because everything
references it. Port and centre integrations come later because they depend on external parties
whose timelines the administration does not fully control — and a programme that front-loads those
stalls in month three.

| Phase | Window | Scope | Domains | Goes live with | External dependency |
|---|---|---|---|---|---|
| 0 | Wk 1–8 | Proof of capability | One service, one agent | A working service on real data | None |
| 1 | Mo 3–8 | Registry foundation | Ships · Facilities & companies · Instrument base | Registration, certification, licensing, instrument base, public portal | Data migration; national SSO |
| 2 | Mo 7–13 | Competency & field | Seafarers · Inspection & audit | STCW certification, inspector mobile app, FSI and PSC, risk targeting | Phase 1 registry; device rollout |
| 3 | Mo 12–20 | Port & single window | Ports | FAL single window, port call lifecycle, tariffs, agency clearance | Customs, immigration, health, port bodies |
| 4 | Mo 16–24 | Operations centre | National Maritime Centre | Fused tracking, incident and SAR, casualty, security levels | AIS/LRIT/VTS feeds; inter-agency accords |
| 5 | Continuous | Agent expansion | All | Agents promoted tier by tier as evidence accumulates | Measured accuracy; governance approval |

**Governance.** Joint steering committee monthly; the client's programme director holds scope.
Phase gates are *signed by* the client, not *reported to* the client.

**Team.** Named individuals with committed allocation, not a rate card. Substitution requires
client approval.

**Capability transfer.** The client's engineers are embedded from Phase 1, not briefed at handover.
Source and documentation live in the client's repository throughout. Transfer is a deliverable with
acceptance criteria.

**Exit.** Source-code escrow, documented runbooks, and a defined transition to the client's team or
another supplier — priced into the contract, not negotiated later under pressure.

---

## 6. Risk register

A register that omits the supplier is not a register. Ours is listed first.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Supplier has no maritime production record** | Certain | High | Phase 0 proof of capability on client data with client exit criteria; payment gated on phase acceptance; source and configuration in the client repository from day one; escrow and a costed exit path |
| Legacy registry data incomplete or inconsistent | High | High | Data-quality assessment in Phase 0 before commitments are priced; migration with reconciliation reporting; a jointly owned remediation workstream, never silently absorbed |
| Inter-agency dependencies stall the single window | High | High | Sequenced to Phase 3 after value has landed; agency onboarding tracked as a named dependency with its own governance; the platform runs without any given agency, degraded rather than blocked |
| Officers do not adopt the field app | Medium | High | Surveyors in the design from week 1; offline-first because a berth has no signal; must be faster than the paper form on day one or it has failed |
| AI output trusted beyond its evidence | Medium | High | Autonomy tiers enforced technically, not by policy; mandatory citation; standing accuracy review that can demote an agent's tier |
| Regulation changes mid-programme | High | Medium | The instrument base is the point — regulatory change is configuration, not a change request; the regulatory-intelligence agent surfaces the downstream impact list |
| Scope expands beyond the phase | High | Medium | The Core/Configure/Extend/Build catalogue is the scope baseline; anything marked Build is estimated separately and enters a later phase by decision, not by drift |
| External data feeds carry commercial terms | Medium | Medium | Satellite AIS, SAR tasking and commercial ship databases priced as pass-through and named in the commercial schedule — not discovered in year 2 |
| Key-person dependency | Medium | Medium | Named team with committed allocation; paired roles on every critical component; client engineers embedded from Phase 1 |

---

## 7. Sovereignty, IP and in-country value

A maritime registry holds ownership structures, crew identity, security levels and enforcement
history. Where it runs, who can read it, and who can operate it after we leave are procurement
questions before they are technical ones.

**Data residency.** Deploys to the national cloud, a sovereign region, or the client's own data
centre — the client's decision, not our default. No operational data leaves the jurisdiction,
including for support. Support access runs through the client's bastion: logged, time-boxed,
revocable. Backup and DR within the same jurisdiction.

**Sovereign AI.** Model routing is a configuration, not an architecture — hosted frontier model,
in-region managed model, or fully on-premise open-weight model. Classification-driven routing pins
sensitive case data to the on-premise path while low-sensitivity drafting uses the stronger model.
Degraded-mode operation is defined for every agent.

*Before offering this: confirm which specific open-weight models the team can actually deploy and
support, and verify data-retention terms against the chosen provider's actual contract — see
`00-claims-and-evidence.md` items E4 and E5.*

**Intellectual property.** Configuration, data model, migrated data and integration code belong to
the client. The platform core is licensed perpetually for the administration's use, with escrow. No
lock-in through proprietary formats — documented schema, full export. Costed exit and transition in
the contract.

**In-country value.** Local delivery presence and national hiring targets stated in the bid; client
engineers embedded from Phase 1 with capability transfer as an accepted deliverable; operating
runbooks written for the client's team and tested by them; named local partner arrangements where
national policy requires them.

---

## 8. Left deliberately blank

Guessing at these in front of an evaluator is worse than leaving them open. Each is confirmed with
the client before the response is issued:

- the host state's cloud policy and accredited providers
- the host state's personal-data protection law
- the national digital-identity scheme for SSO
- the in-country-value scoring model
- the national maritime or transport strategy this programme should be shown to advance
- the client's actual service catalogue, fee schedule and licence renewal periods

---

## 9. What we ask for

1. **A two-day working session** with the administration's officers — the service catalogue on the
   wall, marked live against Core/Configure/Extend/Build. How we handle the services that *do not*
   fit is the only part that tells the client anything.
2. **Exit criteria written by the client**, and the pilot service chosen by the client.
3. **Eight weeks.**

Then the administration decides about the programme with evidence instead of a proposal.

> **The argument in one line.** The platform capability is real and demonstrable, the maritime track
> record is not yet there, and the proposal is built so that the second fact costs the client
> nothing to verify.
