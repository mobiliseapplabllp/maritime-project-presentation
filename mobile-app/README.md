# Maritime Mobile — Interactive Prototype

Working implementation of `design-reference/Interactive Prototype.dc.html` from the
Claude Design project *Maritime Mobile Apps* (Authority + Customer). Two apps, one
page: the complete clickable flows with the exact state logic of the design's
behavioral spec.

## Run

```bash
npm install
npm run dev        # http://localhost:5174
```

- The landing page shows both phones side by side with the scenario toggles
  (Offline mode, AI hints) from the design's props panel.
- `?app=authority` or `?app=customer` renders a single app full-viewport — use this
  on a phone or for screenshots.

## What is implemented

| App | Flow |
| --- | --- |
| **Marine Ops — Authority** | Home → pre-inspection dossier → checklist capture (YES/NO, evidence + AI deficiency suggestion on NO) → AI-drafted report (per-finding approve, sign gated until approved) → signed confirmation. Offline pill reflects the scenario toggle. |
| **Maritime Services — Customer** | Home (expiry alert) → renewal application (pre-filled, auto-fetched certificate) → review & pay → receipt → tracking timeline. Payment flips the home state: counters, renewal card → in-review card, tracking id. |

State logic is a faithful port of the `Component.renderVals()` class in the design
file — including the sign gate, the checklist progress dimming, and the paid-state
derivations.

## Fidelity notes (per the handoff README)

- Mobilise design tokens (`src/tokens.css`, the `--mob-*` set) drive all colors.
- Poppins (headings/numbers) + Source Sans 3 (body) via Google Fonts.
- Placeholder unicode glyphs replaced with **Lucide** icons at 1.75px stroke;
  no emoji in the UI (the UAE PASS flag became a shield icon).
- Device chrome (`ios-frame.jsx`) is presentation-only and deliberately not
  implemented; the phone shell is a neutral rounded container.
- Motion: 150–250 ms ease-out fades only.

## Path to production

Per the handoff, this HTML/React build is the *behavioral and visual spec*. The
production apps are the delta-programme deliverables (customer mobile app, stream
T6; inspector app inside the Smart Inspection delta) — target React Native, backed
by the platform APIs per the TAD: vessel/certificate registers with live validity,
versioned checklist templates, the offline sync queue, the tariff engine and the
notifications feed. The static 36-screen canvas
(`design-reference/Maritime Mobile Apps.dc.html`) covers the full screen inventory
beyond these two flows.
