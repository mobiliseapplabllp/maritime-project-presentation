"""Digital-twin library registry — maps a vessel / port-craft TYPE to its twin.

Twins are authored on the Omniverse GPU box (parametric USD → RTX render), then
their captured angles are served from the portal's static assets. This registry
is the resolution layer the vessel portal calls: given a craft's name / type
group, return the twin descriptor (or None) so the Digital Twin tab can show
it. It grows one entry per craft type as the Tier-1..N library is built.

status: "live" (rendered, viewable) · "wip" (being authored) · absent = no twin.
"""

_BASE = "/api/assets/twins"

TWINS = [
    {
        "id": "asd-harbour-tug",
        "name": "ASD Harbour Tug",
        "category": "PORT_CRAFT",
        "status": "live",
        "match": {
            "device_names": ["MUNDRA SHAKTI", "MUNDRA VEER", "ASD TUG"],
            "group_contains": ["TUG"],
        },
        "angles": [
            {"label": "Hero",   "url": f"{_BASE}/asd-harbour-tug/hero.png"},
            {"label": "Front",  "url": f"{_BASE}/asd-harbour-tug/front.png"},
            {"label": "Detail", "url": f"{_BASE}/asd-harbour-tug/detail.png"},
        ],
        "engine": "NVIDIA Omniverse RTX",
        # Live interactive stream: a dedicated Omniverse Kit instance on the GPU
        # server renders this twin's USD and fans it out over WebRTC. The browser
        # connects to Kit's signaling, TLS-wrapped by nginx as wss://<host>:<signalPort>.
        # The single T4 serves one interactive viewer at a time (the twin service
        # time-shares the GPU with the other render workloads via systemd Conflicts=).
        "stream": {
            "host": "sensegrid.onmobilise.com",
            "signalPort": 49100,
            "cameras": [
                {"label": "Hero",   "path": "/World/Cameras/CamHero"},
                {"label": "Front",  "path": "/World/Cameras/CamFront"},
                {"label": "Detail", "path": "/World/Cameras/CamDetail"},
            ],
        },
        "note": "Rendered from a parametric USD twin on the GPU server. Launch the live view "
                "to stream the interactive RTX render in real time — orbit with the mouse and "
                "jump between camera angles. The green lamp is the live-status indicator.",
    },
    {
        "id": "sts-container-crane",
        "name": "STS Container Crane",
        "category": "CARGO_EQUIPMENT",
        "status": "wip",
        "match": {
            "device_names": ["STS CRANE", "SHIP TO SHORE CRANE"],
            "group_contains": ["CRANE", "QUAY"],
        },
        "angles": [],
        "engine": "NVIDIA Omniverse RTX",
        "note": "Ship-to-shore gantry crane twin — being authored; captured angles land here "
                "as the Tier-2 library is rendered.",
    },
]


def resolve(device_name, device_group=""):
    """Return the twin descriptor for a craft/equipment type, or None."""
    dn = (device_name or "").strip().upper()
    dg = (device_group or "").strip().upper()
    for tw in TWINS:
        m = tw.get("match", {})
        if dn and dn in [x.strip().upper() for x in m.get("device_names", [])]:
            return tw
        if dg and any(c.strip().upper() in dg for c in m.get("group_contains", [])):
            return tw
    return None
