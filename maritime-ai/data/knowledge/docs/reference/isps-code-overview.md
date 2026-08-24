# ISPS Code — security levels and roles overview

> Reference summary compiled from public sources for the Sagar Drishti demo
> library. This is a plain-language overview in the library's own words, not
> the text of the Code; consult SOLAS Chapter XI-2 and the ISPS Code for legal
> use.

## What the ISPS Code is

The International Ship and Port Facility Security (ISPS) Code is the maritime
security regime adopted after 2001 and made mandatory through SOLAS Chapter
XI-2 (in force July 2004). It applies to ships on international voyages
(passenger ships, cargo ships of 500 GT and over, MODUs) and to the port
facilities serving them. Part A of the Code is mandatory; Part B is guidance.
Each government designates the authorities that approve security assessments
and plans (in India, the Directorate General of Shipping is the designated
authority for the ISPS framework).

## The three security levels

- Security Level 1 — normal: the level at which ships and port facilities
  routinely operate; minimum protective measures are maintained at all times
  (access control, identity checks, monitoring of restricted areas). Commonly
  spoken of as "MARSEC Level 1", the usage the Mundra demo portal follows.
- Security Level 2 — heightened: a raised risk of a security incident;
  additional protective measures are applied for as long as the risk persists
  (more thorough checks, escorting, tighter access).
- Security Level 3 — exceptional: an incident is probable or imminent; further
  specific measures apply for a limited period, in close liaison with security
  agencies. Level 3 is set by the government, not by the facility.

Ships must respond to the level set by the port facility or coastal state
(and may never operate below their flag's set level). A ship may request a
Declaration of Security (DoS) — a signed agreement between ship and facility
on who does which security duty during the interface.

## The key roles

- CSO — Company Security Officer: the company's designated person for ship
  security assessments, plans and audits across the fleet.
- SSO — Ship Security Officer: the officer on board responsible for the Ship
  Security Plan (SSP), drills and liaison with the facility.
- PFSO — Port Facility Security Officer: responsible for the Port Facility
  Security Assessment (PFSA) and Port Facility Security Plan (PFSP), for
  setting local measures at each level, and for coordination with ships (the
  office that issues security advisories such as ISPS-ADV-02/2026 in the
  Mundra demo portal).
- RSO — Recognised Security Organisation: may perform assessments or verify
  plans where the government permits.

## Documents and verification

Ships carry an International Ship Security Certificate (ISSC) after
verification of the approved SSP; they maintain security records and a ship
security alert system (SSAS). Port facilities keep the approved PFSP current
and exercise it. PSC officers may check the ISSC and basic security measures;
control measures for non-compliant ships range from inspection to denial of
entry.

## Port relevance in the demo world

MARSEC Level 1 access control at Mundra (dock passes, Gate 3 crew shore leave,
CISF-manned Gate 1, restricted areas, drone reporting) is the ISPS regime in
daily operation — see ISPS-ADV-02/2026 in this library.
