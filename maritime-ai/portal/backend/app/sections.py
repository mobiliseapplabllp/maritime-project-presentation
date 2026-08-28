"""Deep-analysis sections — dedicated analytics per domain:
fleet · incidents · inspections · revenue · crew.

Serves the precomputed stats pack (analysis/out_mundra/sections.json) plus an
on-demand AI narrative per section (local LLM, cached per section+month).
"""
import json
import os
import threading

from fastapi import APIRouter, Depends, HTTPException

from . import claude_cli, config
from .auth import current_user
from .data import get_store

router = APIRouter(prefix="/api/sections", dependencies=[Depends(current_user)])

_SECTIONS = ("fleet", "incidents", "inspections", "revenue", "crew")
_lock = threading.Lock()
_cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                           "agent_state", "section_reports.json")
try:
    _reports = json.load(open(_cache_path))
except Exception:
    _reports = {}
_data_ver = None


def _fresh(s):
    """Drop cached AI briefs when the pipeline data has been rebuilt, so the next
    view regenerates the narrative against the fresh numbers."""
    global _data_ver, _reports
    v = getattr(s, "data_version", None)
    if v != _data_ver:
        _data_ver = v
        _reports = {}


def _load():
    fp = os.path.join(config.ANALYSIS_DIR, "sections.json")
    if not os.path.exists(fp):
        raise HTTPException(503, "Section analytics not built yet")
    return json.load(open(fp))


_TITLES = {
    "fleet": "Vessel fleet", "incidents": "HSE incidents",
    "inspections": "Inspections & PSC", "revenue": "Revenue & receivables",
    "crew": "Crew & seafarers",
}

_LENSES = {
    "authority": "the port administration / harbour master's office (assurance: is the port "
                 "safe and compliant, is service holding as traffic grows, what is owed)",
    "operator": "terminal & marine operations leadership (operational: where is my exposure, "
                "where do I act first, which berths and vessels move the number)",
}

_SECTION_BRIEFS = {
    "fleet": "Cover: fleet size and type mix (CONT/BULK/TANK/GEN/RORO), the 8 documented liner "
             "callers (clean records, excluded from the watchlist by design), per-type "
             "reliability (calls, turnaround, incidents per 100 calls, detention rate, findings "
             "per inspection), and the vessel watchlist — which hulls carry the risk and which "
             "agents represent them. Watch-scores rank attention, they do not accuse.",
    "incidents": "Cover: incident volume and trend, the high/critical share, injuries and "
                 "spills, the near-miss ratio (a LOW ratio signals under-reporting, not "
                 "safety), where incidents cluster by year, and closure discipline "
                 "(avg_close_days). Keep environmental (spills) and security events visible "
                 "as their own threads.",
    "inspections": "Cover: inspections done (PSC/FSI/ISM), findings raised vs closed (closure "
                   "discipline is the compliance heartbeat), detentions and the detention "
                   "rate vs the Indian Ocean MoU norm, and what an open-findings backlog "
                   "would mean for the port's PSC standing. Detentions are the reputational "
                   "number — treat every one as a case study.",
    "revenue": "Cover: billed vs collected (₹ crore), cumulative collection efficiency vs the "
               "95% target, the outstanding book and where it concentrates by terminal/agent, "
               "invoice volumes, and the collection actions that close the gap fastest. Keep "
               "billing and HSE strictly separate — an incident is never a billing event.",
    "crew": "Cover: the seafarer register (headcount, onboard vs ashore), certificate "
            "compliance — expired and expiring certificates are the actionable list — rank "
            "mix, and sea-service currency. Frame certificate lapses as a compliance workflow "
            "issue for the crewing manager, not personal fault.",
}


def _system(section, persona):
    return (
        "You are the Sagar Drishti senior analyst inside Maritime AI Analytics "
        f"(Port Authority, reference deployment — port → 3 cargo zones → 10 terminals → 24 berths). "
        f"Write a DEEP-ANALYSIS BRIEF on {_TITLES[section]} "
        f"for {_LENSES.get(persona, _LENSES['operator'])}, using ONLY the DATA provided. "
        "Plain confident English; define jargon in brackets; cite exact numbers from DATA. "
        + _SECTION_BRIEFS[section] +
        " Markdown, 500-800 words, sections: ## Headline (3-4 sentences), ## What the data shows "
        "(grouped insights with numbers), ## Compliance & exposure (this section's own risk "
        "position only), ## Risks & watch items (bullets), ## Recommended actions (numbered, "
        "owner + timeframe — owners from: Harbour Master / Dy. Conservator / Terminal Manager / "
        "Marine Superintendent / HSE Manager / Berth Supervisor / Finance Controller / Crewing "
        "Manager). Ground rules: benchmarks are public major-port statistics; the demo world is "
        "fictional and deterministic; the 8 documented liner callers stay off negative lists; "
        "never invent numbers, never mention tools/files/AI engines.")


@router.get("")
def list_sections():
    S = _load()
    return {"sections": [{"id": k, "title": _TITLES.get(k, k)} for k in _SECTIONS if k in S]}


@router.get("/{name}")
def section(name: str):
    if name not in _SECTIONS:
        raise HTTPException(404, f"Unknown section '{name}'")
    S = _load()
    if name not in S:
        raise HTTPException(404, f"Section '{name}' not built")
    return {"id": name, "title": _TITLES[name], "data": S[name]}


@router.get("/{name}/analysis")
def section_analysis(name: str, user=Depends(current_user), lang: str = "en", force: int = 0):
    if name not in _SECTIONS:
        raise HTTPException(404, f"Unknown section '{name}'")
    s = get_store()
    _fresh(s)
    persona = (user or {}).get("persona", "operator")
    key = f"{name}|{persona}|{s.latest_month}|{lang}"
    if not force and key in _reports:
        return {"section": name, "report": _reports[key], "cached": True}
    if not claude_cli.available():
        raise HTTPException(503, "Sagar Drishti intelligence engine is offline")
    S = _load()
    data = S.get(name)
    from .chat import lang_rule
    prompt = ("DATA:\n" + json.dumps(data, default=str)[:24000] +
              f"\n\nWrite the deep-analysis brief on {_TITLES[name]}.")
    text = claude_cli.complete(prompt, system=_system(name, persona) + lang_rule(lang),
                               model=config.AGENT_MODEL, timeout=240)
    with _lock:
        _reports[key] = text
        try:
            json.dump(_reports, open(_cache_path, "w"))
        except Exception:
            pass
    return {"section": name, "report": text, "cached": False}
