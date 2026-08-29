# Handoff: Maritime Mobile Apps (Authority + Customer)

## Overview
Two native mobile apps for a national maritime/seaport administration platform (per the Unified Maritime Platform TAD):

1. **Marine Ops (Authority app)** — inspectors, executives, NMC watch officers. Offline-first field inspections, AI pre-inspection dossiers, AI-drafted reports with officer sign-off, risk-ranked boarding targets, NMC alerts/traffic picture, executive KPIs, RBAC role switching.
2. **Maritime Services (Customer app)** — vessel owners/agents and seafarers via UAE PASS. Service catalogue, apply/track/pay, certificate wallet with public QR verification, seafarer CoC & sea service, billing, notifications, grounded AI assistant.

## About the Design Files
The files in this bundle are **design references created in HTML** — they show intended look and behavior; they are NOT production code. The task is to **recreate these designs in the target codebase's environment** (recommended: React Native or Flutter for cross-platform iOS/Android; the backend is the platform's Azure services per the TAD). If no mobile codebase exists yet, choose the framework that best fits the team and implement the designs there.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and copy are final intent — recreate pixel-perfectly using your component library. Icons in the mocks are placeholder unicode glyphs; replace with **Lucide** icons (1.75px stroke) per the Mobilise design system. Device chrome (`ios-frame.jsx`) is presentation only — do not implement.

## Files
- `Maritime Mobile Apps.dc.html` — 36 static screens, grouped in turns. Screen ids:
  - Turn 1 heroes: 1b Inspector home · 1c Checklist capture · 1d Customer home · 1e Certificate wallet (+1a design plan)
  - Turn 2 flows: 2a Authority login · 2b Boarding targets · 2c Vessel risk profile · 2d AI dossier · 2e Sync queue · 2f Report review & sign · 2g NMC alerts · 2h Exec KPIs+assistant · 2i UAE PASS login · 2j Service catalogue · 2k New application · 2l Review & pay · 2m Tracking · 2n QR verify · 2o Seafarer CoC · 2p AI assistant chat
  - Turn 3 module completion: 3a NMC traffic picture · 3b Incident case file · 3c Facility accreditation visit · 3d Regulations library+Q&A · 3e Vessel detail · 3f Company accreditation · 3g Billing · 3h Payment receipt · 3i Notifications · 3j Profile/RBAC
  - Turn 4 edge states: 4a Application returned · 4b Payment failed · 4c Session expired · 4d First-run empty states · 4e No cached dossier (offline degradation) · 4f QR verify invalid/revoked
- `Interactive Prototype.dc.html` — clickable flows (Authority: home→dossier→checklist→report→sign; Customer: home→apply→pay→receipt→track) with working tab bars and state logic in the embedded `Component` class — use it as the behavioral spec.
- `ios-frame.jsx` — presentation-only device frame.

## Design Tokens (Mobilise Design System)
Colors:
- Navy 900 (primary, headers, primary buttons): `#00265D`
- Navy 700 (avatar/panel fills): `#0A3A7D`
- Cyan 600 (accent, AI, active filter): `#00A0C6`; cyan text-on-light: `#007A9B`
- Page background: `#F7F9FB`; canvas gray: `#EEF1F5`; card: `#FFFFFF`
- Borders: `#DFE4EB` (default), `#C3CBD6` (button outline)
- Text: heading `#00265D`, body `#131C2B` / `#3B4757`, muted `#647080`, faint `#8B96A5`
- On-navy muted text: `#9FB4D4`; on-navy faint: `#C9D6EA`
- Status: success `#1E8E5A` on `#E7F6EE`; warning `#B9770E` on `#FDF3E1`; danger `#C43D3D` on `#FBEAEA`; info `#0A3A7D` on `#EEF4FB`; AI-tint bg `#EAF8FC` border `#D3F0F8`
- Dark map screen (3a): bg `#061A38`, land `#0B2C54`, panel `#0E2E5C`, border `#1D4B8F`; track colors green `#4BD48B`, amber `#F5B942`, red `#E0656A`

Typography:
- Headings/numbers: **Poppins** 600/700 (screen titles 19px, card titles 14–15px, stat numbers 18–22px)
- Body: **Source Sans 3** 400/600/700 (body 13–13.5px, secondary 11.5–12px, badges 10.5–11px bold, tab labels 10px)

Spacing & shape:
- 8px base scale; screen padding 16px; card padding 13–16px; stack gap 10–12px
- Radii: cards 10px, badges 5–6px, buttons 7–8px, sheets 18px top
- Shadows: `0 1px 3px rgba(0,38,93,.05)` at rest (cards use border OR shadow, mostly border)
- Hit targets ≥44px for all primary actions

## Key Interactions & Behavior
- **Offline-first (Authority)**: all inspection capture works offline; store-and-forward sync queue (screen 2e) with per-item status (uploading/queued/synced/conflict); template-version conflicts require explicit user resolution; data encrypted at rest; offline pill always visible in header (amber dot = offline, green = online).
- **Checklist capture (1c)**: YES/NO/N-A segmented per item; NO expands notes + photo/voice evidence; AI suggests deficiency code + action, officer must confirm.
- **AI report (2f)**: per-finding Approve/Edit; Sign disabled until all findings approved; sign = digital signature + immutable audit entry + master notification.
- **Customer applications**: pre-filled from register; documents auto-fetched where possible; AI pre-checks uploads; zero-touch eligible services flagged.
- **Wallet/QR (1e, 2n, 4f)**: validity computed live from register, never stored stale; public verify requires no account; shows minimal data; revoked → report-misuse path.
- **Errors always have a way forward** (turn 4): returned application keeps queue place + payment; failed payment states "not charged" + retry; expired session preserves draft and returns to the same step; empty states offer guided actions.
- Navigation: 5-tab bottom bar per app (Authority: Home/Targets/Inspect/Alerts/More · Customer: Home/Services/Fleet/Wallet/More); notifications deep-link to their action.
- Motion: 150–250ms ease-out fades/lifts only.

## State Management (from the prototype)
- Per-app screen state (`a`, `c` in the prototype); checklist answers per item id; finding approval set; payment status flips home-screen cards, counters and tracking id (see `renderVals()` in `Interactive Prototype.dc.html`).
- Data needs: vessel register, certificate register (live validity), risk scores with factor breakdown, checklist templates (versioned, copied at creation), sync queue, tariff/fee engine, notifications feed.

## Assets
- Fonts: Google Fonts — Poppins, Source Sans 3.
- No image assets; QR codes and the traffic map in the mocks are schematic placeholders (use a real QR lib and a charting/map SDK in production).
- Brand: Mobilise design system (navy `#00265D` / cyan `#00A0C6`); no emoji in production UI — replace glyphs with Lucide icons.
