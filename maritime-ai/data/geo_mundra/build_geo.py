#!/usr/bin/env python3
"""
Sagar Drishti — terminal geometry for the 3D port twin.

Emits mundra_terminals.geojson: one polygon per terminal (10), positioned from
the same berth coordinates the operations portal uses, so the twin reads as the
real Navinal Island / West Basin layout. SPMs render as offshore hexagon pads.
Properties per feature: unit_id, unit_name, zone.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Berth positions (lat, lon) — same table as the portal's tracking map
BERTH_POS = {
    "CT1-1": (22.7495, 69.7065), "CT1-2": (22.7502, 69.7085),
    "CT2-1": (22.7511, 69.7105), "CT2-2": (22.7518, 69.7124),
    "CT3-1": (22.7526, 69.7145), "CT3-2": (22.7533, 69.7165),
    "CT4-1": (22.7541, 69.7188), "CT4-2": (22.7548, 69.7208),
    "CT4-3": (22.7555, 69.7228), "CT4-4": (22.7562, 69.7248),
    "CT5-1": (22.7570, 69.7270), "CT5-2": (22.7577, 69.7290),
    "WB-1": (22.7370, 69.6870), "WB-2": (22.7360, 69.6895),
    "MP-1": (22.7435, 69.6990), "MP-2": (22.7442, 69.7008),
    "MP-3": (22.7449, 69.7026), "MP-4": (22.7456, 69.7044),
    "LB-1": (22.7405, 69.6940), "LB-2": (22.7412, 69.6958), "LB-3": (22.7419, 69.6976),
    "SPM-1": (22.6350, 69.6250), "SPM-2": (22.6280, 69.6420),
    "RR-1": (22.7480, 69.7315),
}

TERMINALS = {
    "CT1": ("Container Terminal 1", "Container", ["CT1-1", "CT1-2"]),
    "CT2": ("Container Terminal 2", "Container", ["CT2-1", "CT2-2"]),
    "CT3": ("Container Terminal 3", "Container", ["CT3-1", "CT3-2"]),
    "CT4": ("Container Terminal 4", "Container", ["CT4-1", "CT4-2", "CT4-3", "CT4-4"]),
    "CT5": ("Container Terminal 5", "Container", ["CT5-1", "CT5-2"]),
    "WBC": ("West Basin Coal Terminal", "Dry Bulk & General", ["WB-1", "WB-2"]),
    "MPT": ("Multipurpose Terminal", "Dry Bulk & General", ["MP-1", "MP-2", "MP-3", "MP-4"]),
    "RRT": ("Ro-Ro Terminal", "Dry Bulk & General", ["RR-1"]),
    "LQB": ("Liquid Terminal", "Liquid & Offshore", ["LB-1", "LB-2", "LB-3"]),
    "SPM": ("SPM Crude", "Liquid & Offshore", ["SPM-1", "SPM-2"]),
}

# Quay runs roughly WSW->ENE; extrude terminal blocks landward (north) of the quay line
QUAY_BEARING_DEG = 62.0


def rect_along_quay(pts, along_pad=0.0016, water=0.0008, land=0.0034):
    """Rotated rectangle: berth points sit on the quay edge, block extends landward."""
    th = math.radians(QUAY_BEARING_DEG)
    ux, uy = math.cos(th), math.sin(th)            # along-quay unit (lon, lat approx)
    nx, ny = -uy, ux                               # landward normal
    la = sum(p[0] for p in pts) / len(pts)
    lo = sum(p[1] for p in pts) / len(pts)
    proj = [((p[1] - lo) * ux + (p[0] - la) * uy) for p in pts]
    lo_a, hi_a = min(proj) - along_pad, max(proj) + along_pad
    corners = []
    for a, nvec in ((lo_a, -water), (hi_a, -water), (hi_a, land), (lo_a, land)):
        clon = lo + a * ux + nvec * nx
        clat = la + a * uy + nvec * ny
        corners.append([round(clon, 6), round(clat, 6)])
    corners.append(corners[0])
    return [corners]


def hexpad(center, r=0.004):
    la, lo = center
    ring = [[round(lo + r * math.cos(a), 6), round(la + r * 0.92 * math.sin(a), 6)]
            for a in [i * math.pi / 8 for i in range(16)]]
    ring.append(ring[0])
    return [ring]


def main():
    feats = []
    for tid, (name, zone, codes) in TERMINALS.items():
        pts = [BERTH_POS[c] for c in codes]
        if tid == "SPM":
            for i, p in enumerate(pts, 1):
                feats.append({"type": "Feature",
                              "properties": {"unit_id": tid, "unit_name": name,
                                             "zone": zone, "part": f"SPM-{i}"},
                              "geometry": {"type": "Polygon", "coordinates": hexpad(p)}})
            continue
        feats.append({"type": "Feature",
                      "properties": {"unit_id": tid, "unit_name": name, "zone": zone},
                      "geometry": {"type": "Polygon",
                                   "coordinates": rect_along_quay(pts)}})
    gj = {"type": "FeatureCollection", "features": feats}
    out = os.path.join(HERE, "mundra_terminals.geojson")
    json.dump(gj, open(out, "w"))
    berth_feats = [{"type": "Feature",
                    "properties": {"code": c,
                                   "terminal": next(t for t, (_, _, cs) in TERMINALS.items() if c in cs)},
                    "geometry": {"type": "Point", "coordinates": [p[1], p[0]]}}
                   for c, p in BERTH_POS.items()]
    json.dump({"type": "FeatureCollection", "features": berth_feats},
              open(os.path.join(HERE, "mundra_berths.geojson"), "w"))
    print(f"wrote {out} ({len(feats)} terminal features) + mundra_berths.geojson (24 points)")


if __name__ == "__main__":
    main()
