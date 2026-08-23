# Claims & Evidence Register

**Clear this register before the deck is issued to any client, partner or evaluator.**

Every factual assertion in `deck/index.html` is listed here with its evidence status. The rule is
simple: a claim leaves this repository only when its status is **VERIFIED** and an evidence
reference is recorded against it.

## Status definitions

| Status | Meaning | May be shown to a client? |
|---|---|---|
| **VERIFIED** | Backed by a document, certificate, contract or system that a third party could inspect. | Yes |
| **NEEDS EVIDENCE** | Believed true; nobody has produced the artefact that proves it. | Not until verified |
| **MODELLED** | A design target derived from a stated baseline and a stated method. | Yes — **only** while visibly labelled `Modelled` |
| **DESIGN INTENT** | Describes what the platform is designed to do, not what has been observed in production. | Yes — phrased as design, never as track record |
| **NOT CLAIMED** | Explicitly disclaimed in the deck. | Yes — it is the disclaimer |

---

## A. Track record and corporate claims

| # | Claim | Status | Action before issue |
|---|---|---|---|
| A1 | Mobilise App Lab has **not** delivered a national flag-state registry or Maritime Single Window in production | **NOT CLAIMED** | None — slide 16 states this deliberately |
| A2 | No maritime-authority reference is currently available | **NOT CLAIMED** | None — stated on slide 16 |
| A3 | Gated delivery process (requirements → UI/UX → design → build → review → QA → security → release) is documented and enforced | **NEEDS EVIDENCE** | Attach the written process document; be ready to walk an evaluator through gate artefacts from a real project |
| A4 | Security assessment gate includes OWASP-aligned review, SAST, DAST, and pre-release penetration test | **NEEDS EVIDENCE** | Produce a redacted scan report and a penetration-test certificate |
| A5 | Production systems in service with multi-role approval chains, statutory calculation, immutable audit trails | **NEEDS EVIDENCE** | Name the systems; confirm client consent to reference them; keep the description generic if consent is refused |
| A6 | Years in operation / engineering headcount / ISO certifications / named public-sector clients / largest system by users / uptime record | **NEEDS EVIDENCE** | Placeholders on slide 16. Fill each with a figure **and** its source document, or delete the placeholder |

## B. Platform capability claims

| # | Claim | Status | Note |
|---|---|---|---|
| B1 | Capabilities marked `Core` exist and run today | **NEEDS EVIDENCE** | **Highest-risk item in the deck.** Before issue, a named engineer must confirm each `Core` marking against a running system. Demote anything that cannot be demonstrated in a live screen-share to `Configure`, `Extend` or `Build` |
| B2 | Capabilities marked `Configure` change without a code release | **NEEDS EVIDENCE** | Verify against the actual admin console. If an item needs a developer, it is not `Configure` |
| B3 | Capabilities marked `Extend` build on documented extension points | **DESIGN INTENT** | Confirm the extension points are documented, not merely intended |
| B4 | The reference architecture (slide 14) | **DESIGN INTENT** | Correctly framed — it is presented as a reference architecture, not as a deployed topology |
| B5 | Standards register (slide 15) | **DESIGN INTENT** | Framed as "built against", with a note distinguishing accreditations achieved during delivery. Do not upgrade to a certification claim |
| B6 | ISO/IEC 27001, ISO 22301 | **NEEDS EVIDENCE** | State plainly whether these are *held by the company today* or *targeted for the delivered system*. These are different claims and evaluators score them differently |

## C. Regulatory and domain facts

These are checkable public facts. They are believed accurate as drafted; a domain reviewer should
confirm each against the current instrument before issue, as maritime instruments amend frequently.

| # | Fact as stated | Status | Verify against |
|---|---|---|---|
| C1 | FAL Convention makes electronic port-call data exchange mandatory for Contracting Governments from 1 Jan 2024 | **VERIFIED — recheck** | IMO FAL Convention, 2022 amendments |
| C2 | Riyadh MoU is the Gulf-region Port State Control MoU | **VERIFIED — recheck** | Riyadh MoU Secretariat |
| C3 | STCW 2010 Manila amendments govern seafarer competency | **VERIFIED — recheck** | STCW Convention and Code |
| C4 | MLC 2006 governs seafarer employment, wages, repatriation, complaints | **VERIFIED — recheck** | MLC 2006 as amended |
| C5 | HSSC harmonised survey windows, ±3 months on anniversary date | **VERIFIED — recheck** | IMO HSSC Survey Guidelines, current resolution |
| C6 | IMSAS audits a state's implementation and enforcement of adopted instruments | **VERIFIED — recheck** | III Code; IMSAS framework |
| C7 | IMO Compendium provides the harmonised port-call data model | **VERIFIED — recheck** | IMO Compendium on Facilitation and Electronic Business, current edition |
| C8 | Certificate lists per convention (SOLAS, MARPOL, Load Line, Tonnage, ISM, ISPS, MLC, BWM, AFS) | **VERIFIED — recheck** | Convention texts; national implementing instrument |
| C9 | Licence renewal periods on slide 10 | **DESIGN INTENT** | **These are illustrative defaults, not the client's actual periods.** Replace with the client's real renewal periods, or relabel the column "configurable" |

## D. Quantified impact claims

All figures on slide 25 are **MODELLED**. None is a measured result from a prior deployment.

| # | Figure | Basis | Condition of use |
|---|---|---|---|
| D1 | Ship registration −50 to 70% handling time | Task decomposition: document reading, re-keying, chasing, manual screening, file assembly | Must remain visibly labelled `Modelled`; the baseline column must stay marked "measure wk 0" until measured |
| D2 | PSC report −40 to 60% | Decomposition: pre-boarding research, note-taking, office re-entry, code lookup | As above |
| D3 | Seafarer endorsement −50 to 65% | Decomposition: manual issuing-administration verification, sea-service checking | As above |
| D4 | Port call submissions −60 to 80% | Once-only submission replacing repeated per-agency submission | As above |
| D5 | Certificate lapses "→ near zero", circulars "weeks → days" | Directional, not numeric | Acceptable as directional; do not convert to a percentage |

> **Never present a `Modelled` figure without its label.** If a slide, email or one-pager reproduces
> these numbers, the label travels with them. Stripping it converts a design target into a false
> statement of past performance.

## E. AI and agent claims

| # | Claim | Status | Note |
|---|---|---|---|
| E1 | Ten agents as specified in `docs/03-agentic-ai-architecture.md` | **DESIGN INTENT** | Specifications, not deployed agents. Do not describe any agent as "in production" |
| E2 | Autonomy tiers enforced technically, not by policy alone | **DESIGN INTENT** | The enforcement mechanism (gateway allow-lists) is real and implementable; state it as design |
| E3 | Audit ledger fields (slide 24) | **DESIGN INTENT** | Presented as the design of the ledger |
| E4 | Sovereign / on-premise model routing option | **NEEDS EVIDENCE** | Confirm which specific open-weight models the team can actually deploy and support before offering this |
| E5 | "No training on your data; no retention beyond the request" | **NEEDS EVIDENCE** | Depends entirely on the model provider and contract tier chosen. **Verify against the actual provider terms before stating this to a client** |

## F. Jurisdiction-specific items deliberately left blank

Slide 20 leaves these open on purpose. Guessing at them in front of an evaluator is worse than
leaving them blank.

- Host state's cloud policy and accredited providers
- Host state's personal-data protection law
- National digital-identity scheme for SSO
- In-country-value scoring model
- The national maritime or transport strategy the programme should be shown to advance
- The client's actual service catalogue, fee schedule and licence renewal periods

---

## Sign-off before issue

| Area | Reviewer | Date | Signed |
|---|---|---|---|
| Section A — corporate claims | Managing Director | | |
| Section B — `Core` markings verified against running systems | Engineering Lead | | |
| Section C — regulatory facts | Maritime domain reviewer | | |
| Section D — modelled figures carry labels | Bid Manager | | |
| Section E — AI claims and provider terms | Engineering Lead | | |
| Section F — jurisdiction items completed | Bid Manager | | |
