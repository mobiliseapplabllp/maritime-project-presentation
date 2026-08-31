# Sagar Drishti — Mundra Port AI Analytics (maritime-ai/)

FastAPI (:8010) + React/Vite (:5273) AI analytics portal for Mundra Port.
Fork of the Sodexo HTM AI engine re-pointed at the port domain. Part of the
maritime pre-sales package; the sibling `../portal/` is the MERN operations
portal whose demo snapshot is this product's data source.

**Read `CONTRACT.md` first** — it defines the hierarchy
(port→zone→terminal→berth), the four panels (ops/marine/hse/revenue) and all
column names, the analysis artifacts, branding, accounts and role names.
Never reintroduce the old domain's terms (district/facility/asset/penalty/
WBMSCL/HTM/Poshan).

## Commands

- `cd portal && make install && make dev` — run (backend 8010, frontend 5273)
- Rebuild data after a portal reseed:
  `python3 data/mundra/build_panels.py && python3 analysis/analyze_mundra.py`
- Login: `harbour.master` / `Mundra@2026`

## Hard-won rules (inherited from the engine — still true)

- Backend restarts must be their own short command; never bundle with slow
  curls (process-group SIGTERM kills nohup'd children).
- LLM = local `claude` CLI via `app/claude_cli.py` — always pass `--model`;
  >32KB prompts go via temp file. No cloud keys. Everything must degrade
  gracefully when the CLI is absent (builtin intents, browser TTS, empty RAG).
- Python 3.9-compatible typing in backend (`typing.Optional`, no `X | Y` in
  Pydantic models) — the deploy target is a Mac system Python.
- Vite is pinned to 5273 (strictPort); backend 8010; TTS 8020. The operations
  portal uses 5200 — don't collide.
- i18n: the English string IS the key; missing translations fall back to
  English. AI output language via LANG_RULES suffix; caches are keyed per
  language + element title (changing a card title regenerates its explain).
- All data is the portal's fictional demo world; benchmarks are public
  major-port statistics; the 8 real liner callers stay off watchlists and
  negative lists everywhere.
