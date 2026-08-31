# Port State Control — Indian Ocean MoU inspection regime overview

> Reference summary compiled from public sources for the Sagar Drishti demo
> library. This is a plain-language overview in the library's own words;
> consult the Indian Ocean MoU texts and DG Shipping instructions for legal
> use.

## What port state control is

Port State Control (PSC) is the inspection of foreign-flag ships in national
ports to verify that the ship and its crew comply with the international
conventions — SOLAS, MARPOL, STCW, MLC, Load Lines, ISPS and the rest — and to
detain substandard ships until serious deficiencies are put right. PSC is the
safety net behind flag state certification.

## The Indian Ocean MoU

Port states coordinate regionally through Memoranda of Understanding. India is
a member of the Indian Ocean Memorandum of Understanding on Port State Control
(IOMOU), established in 1998, whose secretariat is hosted in Goa, India. Around
twenty maritime authorities of the Indian Ocean rim participate. The MoU
harmonises inspection procedures (aligned with IMO's PSC procedures
resolution), sets a regional inspection effort, runs an annual report and a
central inspection database, and conducts Concentrated Inspection Campaigns
(CICs) on chosen topics jointly with other regions. In India, PSC is exercised
by DG Shipping's Mercantile Marine Department surveyors at the ports.

## How an inspection runs

1. Selection: ships are targeted by risk — factors include ship type and age,
   flag performance, company performance, and the time since and outcome of
   the last inspection in the region.
2. Initial inspection: certificates and documents, overall condition, crew
   certification and manning, and a walk-through of decks, bridge, engine room
   and accommodation.
3. Clear grounds → more detailed inspection: if certificates are invalid or
   the surveyor forms clear grounds that the ship does not substantially meet
   convention standards, the inspection deepens (operational drills, opening
   up systems).
4. Deficiencies and action: each deficiency is recorded on Form B with a code.
5. Detention: where deficiencies are clearly hazardous to safety, health or
   the environment, the ship is detained until rectification; detentions are
   published by the MoU.

## Deficiency and action coding in plain language

Deficiency codes group by area — the families seen in the Mundra demo
inspection records include: 01 (certificates and documentation), 04 (emergency
systems), 07 (fire safety), 10 (safety of navigation — e.g. charts not
corrected to the latest Notices to Mariners), 11 (life-saving appliances),
13 (propulsion and machinery), 14 (pollution prevention), 18 (labour
conditions / MLC).

Action codes state what must happen, the common ones being: 10 — deficiency
rectified; 15 — rectify at the next port; 16 — rectify within 14 days;
17 — rectify before departure; 30 — grounds for detention. A detainable
deficiency is normally coded 30 with the detention flag set, exactly as the
demo portal's inspection module models it (result DETAINED, action code 30 on
the leading finding).

## Consequences of detention

A detention keeps the ship alongside or at anchor until the recognised
organisation or flag verifies rectification; it raises the ship's and its
flag's risk profile, invites closer targeting across the region, and is a
commercial event (off-hire, delay, reputation). Ports track detention rates as
a fleet-quality indicator — the Sagar Drishti analytics use a PSC detention
benchmark for exactly that purpose, and the vessel watchlist weighs
detentions alongside incidents and findings.

## Related reading in this library

SOLAS, MARPOL, STCW and MLC overviews (the conventions PSC enforces), and the
Merchant Shipping Act, 1958 overview (the Indian legal basis for inspection
and detention).
