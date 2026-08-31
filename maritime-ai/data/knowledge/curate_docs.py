#!/usr/bin/env python3
"""
Knowledge-corpus curator for the Sagar Drishti (Mundra Port) RAG library.

Replaces the old POSHAN-era web harvester (harvest_docs.py): this library is a
CURATED corpus, not a scrape. The documents live as clean markdown under
docs/<category>/ and this script (re)generates manifest.json — the file
build_index.py and the portal's rag.status() read — from the catalog below.

Corpus composition (see README.md):
  port_circulars/ — the Mundra Operations Portal's own demo-world instruments
                    (canon summaries/bodies from the portal seed, expanded)
  reference/      — plain-language summaries of real public maritime
                    instruments, each labelled "Reference summary compiled
                    from public sources for the Sagar Drishti demo library."
  mundra_sops/    — demo-world operating procedures authored for the port

Run:  python3 curate_docs.py   (then python3 build_index.py to rebuild the index)
"""
import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(HERE, "docs")
MANIFEST = os.path.join(HERE, "manifest.json")

SRC_PORTAL = "Mundra Port Operations Portal — instrument register (Sagar Drishti demo world)"
SRC_REF = "Sagar Drishti demo library — reference summary compiled from public sources"
SRC_SOP = "Marine Department, Mundra — demo-world SOP (Sagar Drishti demo)"

# id (path under docs/), title, url, source, category.
# Demo-world documents deliberately carry no external URL ("#"); reference
# summaries point at the responsible authority's public site.
CATALOG = [
    # -------- portal-world circulars, notices and orders (fictional demo world)
    ("port_circulars/PORT-N-07-2026-monsoon-working-restrictions.md",
     "Port Notice PORT-N-07/2026 — Monsoon working restrictions: West Basin and outer anchorage",
     "#", SRC_PORTAL, "port_circulars"),
    ("port_circulars/CIRC-12-2026-electronic-port-clearance-fal.md",
     "Circular CIRC-12/2026 — Electronic port clearance: mandatory FAL declarations via portal",
     "#", SRC_PORTAL, "port_circulars"),
    ("port_circulars/CIRC-09-2026-garbage-reception-fees-marpol-annex-v.md",
     "Circular CIRC-09/2026 — Revised garbage reception fees under MARPOL Annex V",
     "#", SRC_PORTAL, "port_circulars"),
    ("port_circulars/CIRC-07-2024-container-vgm-verification.md",
     "Circular CIRC-07/2024 — Container VGM verification procedure at the gate",
     "#", SRC_PORTAL, "port_circulars"),
    ("port_circulars/ISPS-ADV-02-2026-security-level-1.md",
     "Order ISPS-ADV-02/2026 — Security Level 1 in force: access control reminders",
     "#", SRC_PORTAL, "port_circulars"),
    ("port_circulars/PORT-N-02-2023-cyclone-biparjoy-contingency.md",
     "Port Notice PORT-N-02/2023 — Cyclone Biparjoy contingency berthing restrictions (withdrawn)",
     "#", SRC_PORTAL, "port_circulars"),
    # -------- reference summaries of real public instruments
    ("reference/merchant-shipping-act-1958-overview.md",
     "Merchant Shipping Act, 1958 — structure and key parts",
     "https://www.dgshipping.gov.in/", SRC_REF, "reference"),
    ("reference/major-port-authorities-act-2021-overview.md",
     "Major Port Authorities Act, 2021 — overview",
     "https://shipmin.gov.in/", SRC_REF, "reference"),
    ("reference/indian-ports-act-1908-overview.md",
     "Indian Ports Act, 1908 — basics",
     "https://shipmin.gov.in/", SRC_REF, "reference"),
    ("reference/solas-1974-chapters-overview.md",
     "SOLAS 1974 — chapters overview",
     "https://www.imo.org/en/About/Conventions/Pages/International-Convention-for-the-Safety-of-Life-at-Sea-(SOLAS),-1974.aspx",
     SRC_REF, "reference"),
    ("reference/marpol-annexes-i-vi-overview.md",
     "MARPOL 73/78 — Annexes I–VI overview",
     "https://www.imo.org/en/About/Conventions/Pages/International-Convention-for-the-Prevention-of-Pollution-from-Ships-(MARPOL).aspx",
     SRC_REF, "reference"),
    ("reference/isps-code-overview.md",
     "ISPS Code — security levels and roles overview",
     "https://www.imo.org/en/OurWork/Security/Pages/SOLAS-XI-2%20ISPS%20Code.aspx",
     SRC_REF, "reference"),
    ("reference/mlc-2006-titles-overview.md",
     "Maritime Labour Convention, 2006 — titles overview",
     "https://www.ilo.org/international-labour-standards/maritime-labour-convention-2006",
     SRC_REF, "reference"),
    ("reference/stcw-certification-and-ms-stcw-rules-2014.md",
     "STCW certification structure and the Merchant Shipping (STCW) Rules, 2014",
     "https://www.imo.org/en/About/Conventions/Pages/International-Convention-on-Standards-of-Training,-Certification-and-Watchkeeping-for-Seafarers-(STCW).aspx",
     SRC_REF, "reference"),
    ("reference/psc-indian-ocean-mou-overview.md",
     "Port State Control — Indian Ocean MoU inspection regime overview",
     "https://www.iomou.org/", SRC_REF, "reference"),
    ("reference/imo-fal-convention-declarations-overview.md",
     "IMO FAL Convention — declarations overview",
     "https://www.imo.org/en/About/Conventions/Pages/Convention-on-Facilitation-of-International-Maritime-Traffic-(FAL).aspx",
     SRC_REF, "reference"),
    # -------- Mundra demo-world SOPs
    ("mundra_sops/SOP-MP-01-pilotage-and-towage.md",
     "Mundra SOP MP-01 — Pilotage and towage procedure",
     "#", SRC_SOP, "mundra_sops"),
    ("mundra_sops/SOP-MP-02-bunkering-safety-checklist.md",
     "Mundra SOP MP-02 — Bunkering safety checklist",
     "#", SRC_SOP, "mundra_sops"),
    ("mundra_sops/SOP-MP-03-monsoon-working-restrictions.md",
     "Mundra SOP MP-03 — Monsoon working restrictions SOP",
     "#", SRC_SOP, "mundra_sops"),
    ("mundra_sops/SOP-MP-04-oil-spill-tier1-response.md",
     "Mundra SOP MP-04 — Oil spill Tier-1 response SOP",
     "#", SRC_SOP, "mundra_sops"),
]


def main():
    manifest, missing, total_kb = [], [], 0.0
    for doc_id, title, url, source, category in CATALOG:
        path = os.path.join(DOCS, doc_id)
        if not os.path.exists(path):
            missing.append(doc_id)
            continue
        size_kb = round(os.path.getsize(path) / 1024)
        total_kb += os.path.getsize(path) / 1024
        manifest.append({
            "id": doc_id, "title": title, "url": url, "source": source,
            "category": category,
            "fetched": time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(path))),
            "size_kb": size_kb,
        })
        print(f"  ok [{category}] {title[:74]}", flush=True)
    # warn about files on disk that the catalog doesn't know
    on_disk = {os.path.relpath(os.path.join(r, f), DOCS)
               for r, _, fs in os.walk(DOCS) for f in fs if not f.startswith(".")}
    stray = sorted(on_disk - {c[0] for c in CATALOG})
    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print(f"\nMANIFEST: {len(manifest)} docs, {total_kb:.0f} KB total -> {MANIFEST}")
    if missing:
        print("MISSING from docs/:", *missing, sep="\n  ")
    if stray:
        print("On disk but not in catalog (not indexed):", *stray, sep="\n  ")


if __name__ == "__main__":
    main()
