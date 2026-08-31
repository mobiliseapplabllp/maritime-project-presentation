// Generates dist/maritime-platform-capability.pptx from the same content as deck/index.html
const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';          // 13.333 x 7.5
pres.author = 'Mobilise App Lab';
pres.title  = 'Maritime Digital Platform';

const W = 13.333, H = 7.5, M = 0.55, CW = W - M * 2;

// palette — carried from the HTML deck
const INK   = '0B1F2A';   // chart-ink navy
const DEEP  = '071620';
const SEA   = '0E7C86';   // Gulf shallow-water teal
const SEALT = '45BFC6';   // teal on dark
const AMBER = 'A96F12';   // harbour light — AI layer only
const AMBLT = 'E8B155';
const PAPER = 'F1F4F3';
const TINT  = 'E4EAE9';
const MID   = '3E5561';
const MUTE  = '6B838E';
const WHITE = 'FFFFFF';
const OK    = '2C6E52';
const CRIT  = 'A33229';

const HEAD = 'Cambria', BODY = 'Calibri';
const sh = () => ({ type: 'outer', angle: 90, blur: 8, offset: 1, color: '0B1F2A', opacity: 0.10 });

/* ---------- slide shells ---------- */
function dark(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: INK };
  if (kicker) s.addText(kicker.toUpperCase(), {
    x: M, y: 0.55, w: CW, h: 0.3, fontFace: BODY, fontSize: 11, bold: true,
    color: SEALT, charSpacing: 3, margin: 0 });
  if (title) s.addText(title, {
    x: M, y: 1.0, w: CW * 0.82, h: 1.6, fontFace: HEAD, fontSize: 40, bold: true,
    color: WHITE, margin: 0, valign: 'top' });
  return s;
}
function light(title, kicker, lede, amber) {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  s.addText(kicker.toUpperCase(), {
    x: M, y: 0.42, w: CW, h: 0.28, fontFace: BODY, fontSize: 10.5, bold: true,
    color: amber ? AMBER : SEA, charSpacing: 3, margin: 0 });
  s.addText(title, {
    x: M, y: 0.74, w: CW, h: 0.62, fontFace: HEAD, fontSize: 27, bold: true,
    color: INK, margin: 0, valign: 'top' });
  if (lede) s.addText(lede, {
    x: M, y: 1.42, w: CW * 0.86, h: 0.72, fontFace: BODY, fontSize: 12.5,
    color: MID, margin: 0, valign: 'top', lineSpacingMultiple: 1.15 });
  return s;
}
function divider(part, title, sub, amber) {
  const s = pres.addSlide();
  s.background = { color: DEEP };
  s.addText(part.toUpperCase(), {
    x: M, y: 2.5, w: CW, h: 0.35, fontFace: BODY, fontSize: 12, bold: true,
    color: amber ? AMBLT : SEALT, charSpacing: 4, margin: 0 });
  s.addText(title, {
    x: M, y: 2.95, w: CW * 0.8, h: 1.1, fontFace: HEAD, fontSize: 42, bold: true,
    color: WHITE, margin: 0 });
  s.addText(sub, {
    x: M, y: 4.1, w: CW * 0.62, h: 0.8, fontFace: BODY, fontSize: 14,
    color: 'AAC1C7', margin: 0, lineSpacingMultiple: 1.2 });
  return s;
}

/* ---------- card ---------- */
function card(s, x, y, w, h, o) {
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06, fill: { color: o.fill || WHITE },
    line: { color: o.line || TINT, width: 1 }, shadow: sh() });
  let cy = y + 0.22;
  if (o.kicker) {
    s.addText(o.kicker.toUpperCase(), { x: x + 0.24, y: cy, w: w - 0.48, h: 0.24,
      fontFace: BODY, fontSize: 9, bold: true, color: o.kickerColor || SEA, charSpacing: 2, margin: 0 });
    cy += 0.28;
  }
  if (o.title) {
    s.addText(o.title, { x: x + 0.24, y: cy, w: w - 0.48, h: o.titleH || 0.5,
      fontFace: HEAD, fontSize: o.titleSize || 15, bold: true, color: INK, margin: 0, valign: 'top' });
    cy += (o.titleH || 0.5);
  }
  if (o.body) {
    s.addText(o.body, { x: x + 0.24, y: cy, w: w - 0.48, h: o.bodyH || 0.8,
      fontFace: BODY, fontSize: o.size || 11.5, color: MID, margin: 0, valign: 'top', lineSpacingMultiple: 1.14 });
    cy += (o.bodyH || 0.8);
  }
  if (o.bullets && o.bullets.length) {
    s.addText(o.bullets.map((t, i) => ({
      text: t, options: { bullet: true, breakLine: i < o.bullets.length - 1 } })), {
      x: x + 0.24, y: cy, w: w - 0.48, h: y + h - cy - 0.18,
      fontFace: BODY, fontSize: o.size || 11, color: MID, margin: 0, valign: 'top',
      paraSpaceAfter: 5, lineSpacingMultiple: 1.08 });
  }
}

/* ---------- table ---------- */
function table(s, rows, opts) {
  const o = opts || {};
  const head = rows[0].map(t => ({ text: t, options: {
    bold: true, color: MID, fill: { color: TINT }, fontSize: o.headSize || 9.5,
    fontFace: BODY, charSpacing: 1.2, valign: 'middle' } }));
  const body = rows.slice(1).map((r, i) => r.map((cell, ci) => {
    const isObj = typeof cell === 'object' && cell !== null;
    return { text: isObj ? cell.t : cell, options: {
      color: isObj && cell.c ? cell.c : MID,
      bold: !!(isObj && cell.b) || ci === 0,
      fill: { color: i % 2 ? PAPER : WHITE },
      fontSize: o.size || 10, fontFace: BODY, valign: 'top' } };
  }));
  s.addTable([head, ...body], {
    x: o.x !== undefined ? o.x : M, y: o.y || 2.05, w: o.w || CW,
    colW: o.colW, border: { type: 'solid', color: TINT, pt: 0.75 },
    rowH: o.rowH || 0.3, margin: [5, 7, 5, 7], autoPage: false });
}

/* =========================================================
   01 — TITLE
   ========================================================= */
{
  const s = dark(null, null);
  s.addText('MARITIME DIGITAL PLATFORM', {
    x: M, y: 1.55, w: CW, h: 0.34, fontFace: BODY, fontSize: 12, bold: true,
    color: SEALT, charSpacing: 5, margin: 0 });
  s.addText('Capability, delivery\nand agentic AI', {
    x: M, y: 2.0, w: CW * 0.72, h: 1.9, fontFace: HEAD, fontSize: 46, bold: true,
    color: WHITE, margin: 0, lineSpacingMultiple: 0.98 });
  s.addText('A configurable platform across the seven operating domains of a maritime administration — with an agentic AI layer that does the reading, the cross-checking and the drafting, so officers spend their time deciding rather than assembling.', {
    x: M, y: 4.0, w: CW * 0.62, h: 1.0, fontFace: BODY, fontSize: 13.5,
    color: 'AAC1C7', margin: 0, lineSpacingMultiple: 1.2 });

  const facts = [['7', 'Operating domains'], ['5', 'Capability spines'], ['10', 'Autonomous agents'], ['IMO', 'Riyadh MoU · FAL']];
  facts.forEach((f, i) => {
    const x = M + i * (CW / 4);
    s.addText(f[0], { x, y: 5.35, w: CW / 4 - 0.3, h: 0.62, fontFace: HEAD, fontSize: 32,
      bold: true, color: SEALT, margin: 0 });
    s.addText(f[1], { x, y: 5.98, w: CW / 4 - 0.3, h: 0.32, fontFace: BODY, fontSize: 10.5,
      color: '89A5B0', margin: 0 });
  });
  s.addText('Mobilise App Lab   ·   Figures marked “Modelled” are design targets from a stated baseline, not measured results from a prior deployment.', {
    x: M, y: 6.72, w: CW, h: 0.3, fontFace: BODY, fontSize: 9.5, color: '6E8A96', margin: 0 });
  s.addNotes('Open by naming the frame: this deck answers three separate questions and does not merge them. Point at the footer line — the honesty about modelled figures is deliberate and it is the reason to trust the rest.');
}

/* 02 — THREE QUESTIONS */
{
  const s = light('Three questions, answered in order', 'The brief',
    'You are assessing whether a partner can carry a national maritime programme. That reduces to three questions — and they deserve separate, honest answers rather than one merged pitch.');
  const w = (CW - 0.6) / 3;
  card(s, M, 2.15, w, 3.9, { kicker: 'Part I', title: 'Does the platform already do this?', titleH: 0.72,
    body: 'Seven domains, five capability spines. We show what exists as product, what is configuration, and what is genuine new build — marked cell by cell, not asserted in bulk.', bodyH: 1.5,
    bullets: ['Core — exists and runs today', 'Configure — no code, no release', 'Extend — documented extension points', 'Build — priced as new development'] });
  card(s, M + w + 0.3, 2.15, w, 3.9, { kicker: 'Part II', title: 'Can you deliver it here?', titleH: 0.72,
    body: 'We have not delivered a national flag-state registry before, and we will not pretend otherwise in a tender that can be checked.', bodyH: 1.2,
    bullets: ['A working, demonstrable platform', 'A gated engineering process', 'A funded eight-week proof on your data', 'Exit criteria you write, not us'] });
  card(s, M + (w + 0.3) * 2, 2.15, w, 3.9, { kicker: 'Part III', kickerColor: AMBER, line: 'E0CDA6',
    title: 'What does AI actually change?', titleH: 0.72,
    body: 'Not a chatbot bolted to a portal. Ten scoped agents with tools, citations and enforced autonomy tiers.', bodyH: 1.2,
    bullets: ['Dossiers arrive already assembled', 'Every assertion carries a citation', 'Four autonomy tiers, enforced in code', 'Full audit ledger on every action'] });
  s.addText('A maritime administration verifies references. An unverifiable case study is not a weak claim — in public procurement it is a disqualifying one. What follows is the strongest case that survives verification.', {
    x: M, y: 6.25, w: CW, h: 0.5, fontFace: BODY, fontSize: 11, italic: true, color: MID, margin: 0 });
  s.addNotes('Land Part II honestly here. It disarms the panel and buys credibility for Parts I and III.');
}

/* 03 — DIVIDER I */
divider('Part I', 'Platform capability',
  'Seven operating domains. Five capability spines. Marked honestly, capability by capability, against what exists today.');

/* 04 — CAPABILITY MAP */
{
  const s = light('Seven domains × five capability spines', 'Capability map',
    'The domains are how an administration is organised. The spines are how work actually flows across it — one ship touches all five in a single lifecycle.');
  table(s, [
    ['Operating domain', 'Registration & certification', 'Compliance & risk', 'Vessel tracking', 'Port & terminal ops', 'Inspection & survey', 'Tier'],
    ['Ships', '● primary', '● primary', '◐ feeds', '◐ feeds', '● primary', { t: 'Core', c: OK, b: 1 }],
    ['Seafarers', '● primary', '● primary', '○', '◐ crew lists', '◐ MLC audit', { t: 'Core', c: OK, b: 1 }],
    ['Legislation & circulars', '◐ rules', '● primary', '○', '◐ rules', '● checklists', { t: 'Core', c: OK, b: 1 }],
    ['National Maritime Centre', '○', '● primary', '● primary', '◐ calls', '◐ casualty', { t: 'Configure', c: SEA, b: 1 }],
    ['Smart inspection & audit', '◐ endorses', '● primary', '◐ targeting', '◐ at berth', '● primary', { t: 'Core', c: OK, b: 1 }],
    ['Ports', '○', '◐ clearance', '● primary', '● primary', '◐ at berth', { t: 'Extend', c: AMBER, b: 1 }],
    ['Maritime facilities & companies', '● primary', '● primary', '○', '◐ facilities', '● audit', { t: 'Core', c: OK, b: 1 }],
  ], { y: 2.25, rowH: 0.42, size: 10, colW: [2.5, 1.85, 1.5, 1.4, 1.55, 1.6, 1.83] });
  s.addText('●  the domain owns this spine end to end        ◐  contributes or consumes data across it        ○  not applicable', {
    x: M, y: 6.35, w: CW, h: 0.3, fontFace: BODY, fontSize: 10.5, color: MUTE, margin: 0 });
  s.addNotes('This is the slide the technical evaluator will photograph. Offer to walk any single cell in depth.');
}

/* 05 — SHIPS */
{
  const s = light('The registry is the system of record', 'Domain 01 — Ships',
    'Every other domain resolves back to a ship identity. Get the registry right and inspection, port clearance and risk targeting all inherit it.');
  table(s, [
    ['Registry service', 'Covers', 'Tier'],
    ['Registration', 'Provisional, permanent, bareboat in and out, under-construction, re-registration, change of ownership or name, deletion and closure', { t: 'Core', c: OK, b: 1 }],
    ['Ship identity', 'IMO number, official number, call sign, MMSI, port of registry, tonnage under ITC 69, class linkage to the IACS society', { t: 'Core', c: OK, b: 1 }],
    ['Title & encumbrance', 'Mortgage registration, priority ranking, transfer and discharge; arrest, detention and caveat flags visible downstream', { t: 'Core', c: OK, b: 1 }],
    ['Statutory certificates', 'SOLAS, MARPOL, Load Line, Tonnage, ISM, ISPS, MLC, BWM, AFS and the liability set — issued, endorsed, suspended, withdrawn', { t: 'Core', c: OK, b: 1 }],
    ['Small craft register', 'Dhows, abras, leisure yachts, fishing and workboats — separate lighter register with its own fee and survey rules', { t: 'Configure', c: SEA, b: 1 }],
    ['Radio & CSR', 'MMSI and EPIRB assignment, ship station licence, Continuous Synopsis Record with full history chain', { t: 'Configure', c: SEA, b: 1 }],
    ['RO delegation', 'Which survey each Recognised Organisation may perform on your behalf, with performance tracked against the delegation', { t: 'Core', c: OK, b: 1 }],
  ], { y: 2.2, w: CW * 0.63, colW: [1.7, 4.5, 1.1], rowH: 0.44, size: 9.5 });
  card(s, M + CW * 0.65, 2.2, CW * 0.35, 3.35, {
    kicker: 'Derived, not remembered', title: 'The certificate matrix', titleH: 0.4,
    body: 'Ship type, tonnage, trading area and convention applicability determine which certificates a vessel must carry. The platform derives that set, then holds the HSSC survey windows against it.', bodyH: 1.15,
    bullets: ['Anniversary-date harmonisation', 'Annual, intermediate and renewal windows with the ±3 month rule', 'Short-term extensions with justification on record', 'Conflict detection on out-of-window RO endorsements'], size: 10.5 });
  s.addText('Why it matters for Port State Control: a ship detained abroad on a certificate defect is a flag-state performance event that follows the administration into MoU statistics. The registry that computes the matrix is the registry that stops the defect leaving port.', {
    x: M + CW * 0.65, y: 5.7, w: CW * 0.35, h: 1.0, fontFace: BODY, fontSize: 10.5,
    italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 06 — SEAFARERS */
{
  const s = light('One seafarer identity, from cadet to master', 'Domain 02 — Seafarers',
    'STCW competency, sea service, medical fitness and MLC entitlements are usually four disconnected systems. Held as one identity they cross-validate each other — and fraud stops being invisible.');
  const w = (CW - 0.6) / 3;
  card(s, M, 2.2, w, 3.5, { title: 'Competency & certification', titleH: 0.42,
    bullets: ['Certificates of Competency and Proficiency under STCW 2010 as amended',
      'GMDSS operator certificates and radio endorsements',
      'Certificates of Recognition — flag endorsement of foreign CoCs, with issuing-administration verification',
      'Revalidation, upgrade paths and gap analysis against the STCW table'] });
  card(s, M + w + 0.3, 2.2, w, 3.5, { title: 'Service & identity', titleH: 0.42,
    bullets: ['Seafarer Identity Document and Continuous Discharge Book issue and replacement',
      'Sea-service records validated against vessel movement history and crew lists — not the applicant’s own declaration alone',
      'Medical fitness certificates and approved-examiner register',
      'Biometric enrolment where national identity policy requires it'] });
  card(s, M + (w + 0.3) * 2, 2.2, w, 3.5, { title: 'Training & employment', titleH: 0.42,
    bullets: ['Training institute accreditation, course approval and audit against approved syllabus',
      'Examination scheduling, assessor rostering, result capture',
      'Manning agency licensing and periodic inspection',
      'MLC 2006 — employment agreements, wages, repatriation, complaint escalation'] });
  s.addText('Manning closes the loop. The Minimum Safe Manning Document issued against a ship in Domain 01 is enforced against the crew list in Domain 06 and checked by the inspector in Domain 05 — the same three records read three ways, which is only possible if they are one record.', {
    x: M, y: 5.95, w: CW, h: 0.7, fontFace: BODY, fontSize: 11, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 07 — LEGISLATION */
{
  const s = light('Regulation as structured data, not a PDF library', 'Domain 03 — Legislation & circulars',
    'Most administrations publish circulars as documents, then re-type their content into checklists, forms and fee tables by hand. Held as data, a change propagates instead of being re-keyed — and you can prove to an auditor that it did.');
  card(s, M, 2.3, CW * 0.4, 3.3, { title: 'The instrument base', titleH: 0.42,
    bullets: ['Maritime law, ministerial resolutions, technical and marine notices, circulars',
      'Bilingual parallel text — Arabic and English as one instrument with two renderings, not two documents',
      'Version chains with effective dates, amendment and supersession links',
      'Public portal, subscription alerts, and public-consultation workflow'] });
  // traceability chain
  const cx = M + CW * 0.43, cw = CW * 0.57;
  const chain = [
    ['IMO instrument', 'MARPOL Annex VI Reg. 14 — sulphur content of fuel oil', SEA],
    ['National instrument', 'Ministerial Resolution — adopting article, effective date, penalties', MID],
    ['Administrative procedure', 'Surveyor SOP — bunker delivery note retention, sampling method', MID],
    ['Checklist item → evidence', 'PSC deficiency code · photo · sample seal no. · officer · timestamp', AMBER],
  ];
  s.addText('TRACEABILITY CHAIN — ONE QUERY, END TO END', { x: cx, y: 2.3, w: cw, h: 0.24,
    fontFace: BODY, fontSize: 9, bold: true, color: MUTE, charSpacing: 2, margin: 0 });
  chain.forEach((c, i) => {
    const y = 2.62 + i * 0.83;
    s.addShape(pres.ShapeType.roundRect, { x: cx, y, w: cw, h: 0.66, rectRadius: 0.05,
      fill: { color: i === 3 ? 'F7EFE0' : (i === 0 ? 'E4F0F1' : WHITE) },
      line: { color: i === 3 ? 'E0CDA6' : TINT, width: 1 }, shadow: sh() });
    s.addText(c[0], { x: cx + 0.2, y: y + 0.08, w: cw - 0.4, h: 0.26, fontFace: HEAD,
      fontSize: 12, bold: true, color: INK, margin: 0 });
    s.addText(c[1], { x: cx + 0.2, y: y + 0.34, w: cw - 0.4, h: 0.26, fontFace: BODY,
      fontSize: 10, color: c[2], margin: 0 });
    if (i < 3) s.addShape(pres.ShapeType.downArrow, { x: cx + 0.36, y: y + 0.68, w: 0.14, h: 0.13, fill: { color: 'AFC1C2' }, line: { color: 'AFC1C2' } });
  });
  s.addText('IMSAS readiness. The IMO Member State Audit Scheme asks a state to demonstrate that adopted conventions are implemented and enforced. That is exactly this chain — queryable, with evidence attached at every link, rather than assembled by hand in the weeks before an audit.', {
    x: M, y: 5.85, w: CW * 0.4, h: 1.0, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 08 — NMC */
{
  const s = light('One operating picture, 24 hours a day', 'Domain 04 — National Maritime Centre',
    'The centre’s value is not the video wall — it is that the vessel on the wall is already linked to its certificates, its detention history, its crew list and its owner.');
  const w = (CW - 0.9) / 4;
  const cards = [
    ['Domain awareness', ['Terrestrial and satellite AIS, LRIT, VMS and coastal radar fused into one track store', 'VTS interoperability, national and port level', 'Geofences — territorial sea, anchorages, MPAs, exclusion zones', 'Common operating picture shared under role-scoped access']],
    ['Incident & SAR', ['MRCC incident log, distress intake, asset tasking, on-scene coordination', 'Timelines reconstructed from track history, not recollection', 'Inter-agency escalation matrix with duty rosters', 'After-action pack generated from the log']],
    ['Casualty & pollution', ['Investigation under the Casualty Investigation Code — case file, evidence chain, recommendations', 'Pollution response under OPRC with tiered activation', 'Findings feed the risk model and the checklist', 'GISIS-compatible casualty reporting']],
    ['Maritime security', ['ISPS security level declaration and propagation to port facilities', 'Ship security alert handling', 'Port facility assessment and plan status on the map', 'Sanctions and watchlist correlation against live tracks']],
  ];
  cards.forEach((c, i) => card(s, M + i * (w + 0.3), 2.2, w, 3.55, { title: c[0], titleH: 0.4, bullets: c[1], size: 10 }));
  s.addText('Tier — Configure.  The case-management, mapping, fusion and alerting substrate is core. What is configuration is your sensor inventory, geofence set, escalation matrix and agency access model. What is genuine integration work is each upstream feed — scoped in the roadmap, not hand-waved here.', {
    x: M, y: 6.0, w: CW, h: 0.7, fontFace: BODY, fontSize: 11, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 09 — INSPECTION */
{
  const s = light('Inspect the right ship, not the next ship', 'Domain 05 — Smart inspection & audit',
    'Inspection capacity is fixed; arrivals are not. The whole discipline is targeting — a defensible risk profile, scarce surveyor hours spent against it, and a selection you can justify afterwards.');
  table(s, [
    ['Regime', 'What the platform runs'],
    ['Flag State Inspection', 'Annual and ad-hoc FSI programme, surveyor assignment, findings, corrective action to closure'],
    ['Port State Control', 'Targeting under Riyadh MoU methodology, initial and more-detailed inspection, deficiency coding, detention decision, rectification and follow-up'],
    ['ISM audit', 'Document of Compliance and Safety Management Certificate — initial, annual, intermediate, renewal; major non-conformity handling'],
    ['ISPS audit', 'International Ship Security Certificate verification; port facility security audits against the approved plan'],
    ['MLC inspection', 'DMLC Parts I and II, on-board conditions, complaint-triggered inspection'],
    ['Oversight audits', 'ROs against delegation, training institutes against syllabus, licensed facilities against condition'],
    ['IMSAS evidence', 'Standing evidence library mapped to the audit standard — not assembled in the weeks before an audit'],
  ], { y: 2.35, w: CW * 0.6, colW: [1.75, 6.0], rowH: 0.44, size: 9.5 });
  card(s, M + CW * 0.63, 2.35, CW * 0.37, 3.95, {
    kicker: 'Field-first, offline-first', kickerColor: AMBER, line: 'E0CDA6', fill: 'FDFAF4',
    title: 'The inspector’s device is the primary interface', titleH: 0.62,
    body: 'Not a web form retyped at the office at 19:00. It carries the targeted vessel list, the checklist derived from the instrument base, and the ship’s full history — and it works at a berth with no signal.', bodyH: 1.15,
    bullets: ['Offline capture with conflict-safe sync', 'Photo and video evidence bound to the checklist item and geotagged',
      'Deficiency code suggested from photo and note — officer confirms, never auto-files',
      'Report and detention justification drafted against convention references before the surveyor leaves the gangway',
      'Electronic signature and immediate issue to the master'], size: 10 });
}

/* 10 — PORTS */
{
  const s = light('One submission, every agency', 'Domain 06 — Ports',
    'Since 1 January 2024 the FAL Convention has made electronic exchange of port-call data mandatory for Contracting Governments. A Maritime Single Window is a treaty obligation with a date that has already passed — not a modernisation option.');
  card(s, M, 2.35, CW * 0.36, 2.6, { title: 'Maritime Single Window', titleH: 0.4,
    bullets: ['FAL Forms 1–7 — general declaration, cargo, ship’s stores, crew effects, crew and passenger lists, dangerous goods',
      'Aligned to the IMO Compendium harmonised data model, so submissions are reusable rather than port-specific',
      'Once-only principle — the agent submits once; customs, immigration, health, security and the port each read their slice',
      'Machine-to-machine API alongside the web channel'], size: 10.5 });
  s.addText('Tier — Extend.  Declaration handling, workflow, clearance and the tariff engine are core. The extension is your specific agency clearance rules and the terminal systems in scope — genuine work, which we would rather price than describe as a switch.', {
    x: M, y: 5.1, w: CW * 0.36, h: 0.9, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
  const gx = M + CW * 0.39, gw = (CW * 0.61 - 0.3) / 2;
  const quads = [
    ['Port call lifecycle', ['Pre-arrival notification and ETA management', 'Berth allocation and conflict resolution', 'Pilotage, towage and mooring ordering', 'Arrival, shifting, departure clearance', 'Waste reception and delivery receipt']],
    ['Terminal operations', ['Gate, yard and berth for container, bulk and ro-ro', 'Crane moves per hour and berth productivity', 'Equipment and gang deployment', 'TOS interoperability rather than replacement']],
    ['Revenue', ['Configurable tariff engine — dues, berth hire, pilotage, tug, waste', 'Automatic assessment from the call record', 'Invoicing, payment gateway, dispute handling', 'Concession and lease revenue tracking']],
    ['Safety & performance', ['IMDG dangerous-goods declaration and approval', 'Under-keel clearance and tidal window checks', 'Port performance on the UNCTAD/World Bank basis', 'Waiting time, turnaround and dwell measured']],
  ];
  quads.forEach((q, i) => card(s, gx + (i % 2) * (gw + 0.3), 2.35 + Math.floor(i / 2) * 1.95, gw, 1.8,
    { title: q[0], titleH: 0.34, bullets: q[1], size: 9 }));
}

/* 11 — FACILITIES */
{
  const s = light('Licensing is one engine, not fourteen forms', 'Domain 07 — Maritime facilities & companies',
    'Every licence type differs in its eligibility test, documents and inspection — and is identical in its lifecycle. One configurable lifecycle is the difference between adding a licence type in a fortnight and adding one in a release.');
  table(s, [
    ['Licensed entity', 'Regulated because', 'Renewal*'],
    ['Shipping agencies', 'Act for the owner in port-call and clearance submissions', 'Annual'],
    ['Ship management companies', 'Hold the Document of Compliance; ISM-accountable', 'Annual'],
    ['Manning agencies', 'MLC 2006 recruitment and placement obligations', 'Annual'],
    ['Bunker suppliers', 'MARPOL Annex VI fuel quality and delivery notes', 'Annual'],
    ['Ship repair yards & dry docks', 'Hot work, safety case, hazardous waste, recycling', '2 years'],
    ['Marinas & jetties', 'Facility safety, berth capacity, small-craft registry linkage', '2 years'],
    ['Marine surveyors & consultants', 'Issue reports the administration relies on', '2 years'],
    ['Recognised Organisations', 'Exercise delegated statutory authority', 'By agreement'],
    ['Training institutes', 'Deliver STCW-approved courses', '3 years'],
    ['ISPS port facilities', 'Statement of Compliance against approved security plan', '5 years'],
  ], { y: 2.35, w: CW * 0.62, colW: [2.5, 4.1, 1.35], rowH: 0.33, size: 9.5 });
  card(s, M + CW * 0.65, 2.35, CW * 0.35, 3.15, { title: 'One lifecycle, configured per type', titleH: 0.6,
    bullets: ['Apply — document set per licence type, not hard-coded', 'Screen — completeness and eligibility against the licence matrix',
      'Evaluate — technical assessment routed by competency', 'Inspect — into the same field app as Domain 05',
      'Issue — licence with conditions, scope and validity', 'Supervise — periodic audit, complaints, performance rating',
      'Enforce — warning, condition, suspension, revocation, penalty'], size: 10 });
  s.addText('The compounding effect. A licensed company’s audit history feeds the ship risk profile of every vessel it manages. A poor manager makes its fleet a targeting priority automatically — which is what a risk-based administration is supposed to do, and what separate departmental systems cannot do at all.', {
    x: M + CW * 0.65, y: 5.65, w: CW * 0.35, h: 1.1, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
  s.addText('* Illustrative defaults — replace with the client’s actual renewal periods before issue.', {
    x: M, y: 6.35, w: CW * 0.62, h: 0.25, fontFace: BODY, fontSize: 9.5, color: CRIT, margin: 0 });
}

/* 12 — RISK + TRACKING */
{
  const s = light('Compliance, risk and vessel tracking', 'Cross-cutting spines',
    'Targeting only works if the score is explainable, and position data is only useful once it is joined to everything else the administration knows.');
  table(s, [
    ['Risk factor', 'Source of truth', 'Weight'],
    ['Detention history', 'PSC records, own and MoU-exchanged', 'High'],
    ['Deficiency density', 'Deficiencies per inspection, last 36 months', 'High'],
    ['Company performance', 'DoC holder’s fleet record — Domain 07', 'High'],
    ['RO performance', 'Detention rate on the society’s certificates', 'Medium'],
    ['Ship age & type', 'Registry — Domain 01', 'Medium'],
    ['Certificate status', 'Live matrix, overdue survey windows', 'Medium'],
    ['Casualty involvement', 'Casualty and incident file — Domain 04', 'Medium'],
    ['Behavioural anomaly', 'AIS gaps, spoofing, STS patterns', 'Advisory'],
    ['Sanctions exposure', 'Ownership chain vs UN, OFAC, EU lists', 'Override'],
  ], { y: 2.3, w: CW * 0.52, colW: [2.3, 3.3, 1.33], rowH: 0.33, size: 9.5 });
  card(s, M + CW * 0.55, 2.3, CW * 0.45, 2.0, { title: 'Non-negotiable properties of the score', titleH: 0.36,
    bullets: ['Explainable — every score opens to its factor breakdown and the underlying record',
      'Versioned — a weighting change is an event with an author and a date',
      'Simulated before adopted — replay 12 months of arrivals before it goes live',
      'Advisory where it must be — behavioural signals never alone produce a detention'], size: 10 });
  card(s, M + CW * 0.55, 4.42, CW * 0.45, 1.8, { title: 'Tracking is only useful once joined', titleH: 0.36,
    body: 'Every administration can display AIS. The value is the join: this track belongs to a ship whose ISM certificate lapses in eleven days, managed by a company under audit, carrying two unverified endorsements — and it is inbound to your anchorage.\n\nFused: terrestrial and satellite AIS, LRIT, VMS, radar and VTS.  Derived: AIS gaps, spoofing, ship-to-ship transfer, voyage deviation.', bodyH: 1.2, size: 10 });
  s.addText('An honest limit. AIS is self-reported and can be switched off or falsified; satellite AIS has revisit gaps; SAR tasking costs money per scene. We design for corroboration across sources and surface confidence on every derived signal. An administration that acts on a single unverified source will eventually board the wrong ship.', {
    x: M, y: 6.35, w: CW, h: 0.6, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 13 — CONFIGURE */
{
  const s = light('What “already built” honestly means', 'The customisation model',
    'Every vendor says their platform is configurable. The question worth asking is which specific things change without code — because that determines whether your second year is spent adding services or raising change requests.');
  table(s, [
    ['Tier', 'Definition', 'Examples in this platform', 'Lead time'],
    [{ t: 'Core', c: OK, b: 1 }, 'Exists and runs today. Your work is data migration and acceptance.', 'Registry lifecycle, certificate matrix, licensing engine, inspection and audit workflow, case management, documents, RBAC, audit ledger, notifications, reporting', '—'],
    [{ t: 'Configure', c: SEA, b: 1 }, 'Changed by an administrator through the console. No release, no developer.', 'Service catalogue and forms, workflow stages and routing, fee and tariff tables, checklist libraries, licence types and conditions, risk weights, roles and delegations, bilingual labels, SLA clocks, dashboards', 'Hours–days'],
    [{ t: 'Extend', c: AMBER, b: 1 }, 'Built on documented extension points — APIs, connectors, rule modules — without forking the core.', 'Agency clearance rules, terminal system connectors, national identity SSO, payment gateway, e-signature, GIS layers, sensor feeds, external registry lookups', 'Weeks'],
    [{ t: 'Build', c: CRIT, b: 1 }, 'Genuinely new. Estimated, scheduled and priced like new development, because it is.', 'Anything specific to your legal framework with no analogue in the core; bespoke terminal automation; novel inter-agency protocols', 'Sprint-scoped'],
  ], { y: 2.5, colW: [1.15, 3.0, 6.65, 1.43], rowH: 0.85, size: 10 });
  s.addText('Why this table is in the deck at all. A vendor who marks everything Core is either not reading your requirement or is planning to argue about it later. We would rather have the argument now, on a slide, than in month seven of delivery — so in week one we walk your actual service catalogue and mark every service against these four tiers. That marked catalogue, not this slide, is the real answer to “does it already do this”.', {
    x: M, y: 6.05, w: CW, h: 0.8, fontFace: BODY, fontSize: 11, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.14 });
}

/* 14 — ARCHITECTURE */
{
  const s = light('Agents above, services below, one governed layer between', 'Reference architecture',
    'The critical structural decision: agents hold no privileged data path. They call the same governed APIs the officer’s screen calls, through the same authorisation, into the same audit ledger.');
  const bandLabel = (y, t) => s.addText(t.toUpperCase(), { x: M, y, w: 3.4, h: 0.22,
    fontFace: BODY, fontSize: 8, bold: true, color: MUTE, charSpacing: 1.5, margin: 0 });
  const row = (y, h, items, fill, line, txt) => {
    const n = items.length, gap = 0.12, bw = (CW - gap * (n - 1)) / n;
    items.forEach((t, i) => {
      s.addShape(pres.ShapeType.roundRect, { x: M + i * (bw + gap), y, w: bw, h,
        rectRadius: 0.05, fill: { color: fill }, line: { color: line, width: 1 } });
      s.addText(t, { x: M + i * (bw + gap), y, w: bw, h, fontFace: BODY, fontSize: 9.5,
        color: txt || INK, align: 'center', valign: 'middle', margin: 2 });
    });
  };
  bandLabel(2.12, 'Channels');
  row(2.34, 0.42, ['Public portal\nAR / EN, RTL', 'Officer workspace', 'Inspector mobile\noffline-first', 'NMC operations', 'Agent / line API', 'Assistant\nbilingual'], WHITE, TINT);
  bandLabel(2.88, 'Experience');
  row(3.08, 0.3, ['API gateway  ·  session & consent  ·  rate limiting  ·  bilingual rendering  ·  accessibility'], 'ECF1F0', TINT);
  bandLabel(3.5, 'Agentic orchestration layer');
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 3.7, w: CW, h: 1.16, rectRadius: 0.06,
    fill: { color: 'FBF3E4' }, line: { color: 'E0CDA6', width: 1 } });
  const ag = [['Planner / supervisor', 'decomposes a request into a verifiable plan'],
              ['Specialist mesh — 10 agents', 'scoped tools, scoped data, scoped authority'],
              ['Verifier / critic', 'adversarial check before a human sees it'],
              ['Tool gateway', 'the same governed APIs the UI calls'],
              ['Grounding & citations', 'instrument base, SOPs, precedent'],
              ['Policy guardrails', 'autonomy tiers, PII redaction, model routing']];
  const aw = (CW - 0.5 - 0.24) / 3;
  ag.forEach((a, i) => {
    const x = M + 0.12 + (i % 3) * (aw + 0.12), y = 3.82 + Math.floor(i / 3) * 0.5;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: aw, h: 0.44, rectRadius: 0.04,
      fill: { color: WHITE }, line: { color: 'E0CDA6', width: 1 } });
    s.addText(a[0], { x, y: y + 0.03, w: aw, h: 0.2, fontFace: BODY, fontSize: 9.5, bold: true, color: INK, align: 'center', margin: 0 });
    s.addText(a[1], { x, y: y + 0.22, w: aw, h: 0.19, fontFace: BODY, fontSize: 8, color: MUTE, align: 'center', margin: 0 });
  });
  bandLabel(4.96, 'Domain services');
  row(5.16, 0.32, ['Ship registry', 'Seafarer', 'Instrument base', 'Maritime centre', 'Inspection', 'Port & single window', 'Licensing'], 'E4F0F1', 'A8D2D5');
  row(5.56, 0.32, ['Risk engine', 'Workflow & SLA', 'Documents & e-sign', 'Fees & payments', 'Identity & RBAC', 'Notifications'], WHITE, TINT);
  bandLabel(5.98, 'Data & integration');
  row(6.18, 0.32, ['Operational store', 'Track store (geo/time)', 'Object & document store', 'Event bus', 'Immutable audit ledger', 'Warehouse & BI'], WHITE, 'A8D2D5');
  s.addText('External systems of record — IMO GISIS  ·  Riyadh MoU exchange  ·  IACS societies / ROs  ·  national identity SSO  ·  customs & immigration  ·  satellite AIS / LRIT', {
    x: M, y: 6.6, w: CW, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTE, margin: 0 });
  s.addText('Cross-cutting — data residency  ·  encryption at rest and in transit  ·  observability  ·  DevSecOps  ·  DR and business continuity', {
    x: M, y: 6.86, w: CW, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTE, margin: 0 });
}

/* 15 — DIVIDER II */
divider('Part II', 'Delivery',
  'What we can prove, what transfers, and what we are not claiming — followed by an eight-week proof that costs you nothing to verify.');

/* 16 — PROVE / TRANSFER / NOT CLAIMED */
{
  const s = light('What we prove, what transfers, and what we do not claim', 'Delivery capability',
    'Three columns, because merging them is how vendors mislead. Read the third one first — it is the reason to believe the other two.');
  const w = (CW - 0.6) / 3;
  card(s, M, 2.15, w, 4.0, { kicker: 'Proven — verifiable today', kickerColor: OK, title: 'Engineering discipline', titleH: 0.4,
    bullets: ['Gated delivery — requirements, UI/UX, design, build, code review, QA, security assessment, release; each gate closed before the next opens',
      'Security in the gate, not after it — OWASP-aligned review, SAST and DAST in the pipeline, penetration test before release',
      'Production systems carrying multi-role approval chains, statutory calculation, immutable audit trails and regulated document output',
      'The architecture and agent designs in this deck — reviewable now, before you spend anything'], size: 10 });
  card(s, M + w + 0.3, 2.15, w, 4.0, { kicker: 'Transferable — structurally identical', title: 'A registry is a regulated workflow system', titleH: 0.62,
    bullets: ['Multi-party, multi-stage approval with segregation of duties — the shape of registration, licensing and certification',
      'Immutable audit of every state change with before-and-after snapshots',
      'Rule-driven calculation producing a legally consequential number — tonnage, fees, tariffs, risk scores',
      'Controlled document generation with versioning and revocation — certificate issue and withdrawal',
      'Role-scoped access across organisations — agencies, ROs, inter-agency clearance'], size: 10 });
  card(s, M + (w + 0.3) * 2, 2.15, w, 4.0, { kicker: 'Not claimed', kickerColor: CRIT, line: 'E2BDB9', fill: 'FDF6F5',
    title: 'Stated plainly, in writing', titleH: 0.4,
    bullets: ['We have not previously delivered a national flag-state registry or Maritime Single Window in production',
      'We hold no maritime-authority reference you can call today',
      'Any figure marked “Modelled” is a design target from a stated baseline, not a measured outcome',
      'Why say this: because you will check. A reference that evaporates under diligence costs the bid and the relationship'], size: 10 });
  s.addText('Corporate credentials to insert before issue: years in operation · engineering headcount · ISO certifications held · named public-sector clients · largest system by users · uptime record — each with a document reference.', {
    x: M, y: 6.35, w: CW, h: 0.5, fontFace: BODY, fontSize: 10, italic: true, color: CRIT, margin: 0 });
}

/* 17 — PROOF */
{
  const s = light('Eight weeks. Your data. One real service, in production shape.', 'The offer',
    'Rather than ask you to believe a case study, we propose you watch us build — on your own records, in your own environment, against exit criteria you write before we start.');
  table(s, [
    ['Weeks', 'Stage', 'What is produced', 'What you can check'],
    ['1–2', 'Service catalogue & fit', 'Your full service list marked Core / Configure / Extend / Build; target-state process for the chosen service; data-quality assessment of the source records', 'Whether we understood your regulation, or only its vocabulary'],
    ['3–4', 'Configure the core', 'The chosen service standing up on the configured platform — forms, workflow, roles, fees, documents, bilingual labels — with no bespoke code', 'Exactly how much is configuration, measured rather than asserted'],
    ['5–6', 'Real data & integration', 'Migration of a representative record set; one live integration; the audit ledger populated with real transactions', 'Whether your legacy data survives contact with a modern data model'],
    ['7', 'Agent on the service', 'One agent in Tier 1 — drafting for officer approval, every output cited, nothing auto-executed', 'Whether the AI claim is substantive or decorative'],
    ['8', 'Assessment', 'Officer-run acceptance against your criteria; security scan results; measured cycle time against the pre-pilot baseline; full-programme estimate grounded in observed velocity', 'Everything at once — against criteria you wrote in week 0'],
  ], { y: 2.3, colW: [0.85, 2.0, 5.6, 3.78], rowH: 0.62, size: 9.5 });
  const w = (CW - 0.6) / 3;
  card(s, M, 5.75, w, 1.25, { title: 'You keep the output', titleH: 0.3, body: 'Configuration, migrated data, integration code and documentation are yours at the end of week 8 — whether or not you proceed with us.', size: 10 });
  card(s, M + w + 0.3, 5.75, w, 1.25, { title: 'Exit criteria are yours', titleH: 0.3, body: 'Written and signed before week 1. We do not mark our own work, and we do not move the line in week 7.', size: 10 });
  card(s, M + (w + 0.3) * 2, 5.75, w, 1.25, { line: 'E0CDA6', fill: 'FDFAF4', title: 'Recommended first service', titleH: 0.3, body: 'Small-craft registration or a single PSC inspection flow — high volume, well-bounded, low political risk, touching every layer.', size: 10 });
}

/* 18 — ROADMAP */
{
  const s = light('Sequenced so value lands before the hard integrations', 'Programme roadmap',
    'The registry comes first because everything else references it. Port and centre integrations come later because they depend on external parties whose timelines you do not fully control — and a programme that front-loads those stalls in month three.');
  table(s, [
    ['Phase', 'Scope', 'Domains', 'Goes live with', 'External dependency'],
    ['0 · Wk 1–8', 'Proof of capability', 'One service, one agent', 'A working service on real data', 'None'],
    ['1 · Mo 3–8', 'Registry foundation', 'Ships · Facilities & companies · Instrument base', 'Registration, certification, licensing, instrument base, public portal', 'Data migration; national SSO'],
    ['2 · Mo 7–13', 'Competency & field', 'Seafarers · Inspection & audit', 'STCW certification, inspector mobile app, FSI and PSC, risk targeting', 'Phase 1 registry; device rollout'],
    ['3 · Mo 12–20', 'Port & single window', 'Ports', 'FAL single window, port call lifecycle, tariffs, agency clearance', 'Customs, immigration, health, port bodies'],
    ['4 · Mo 16–24', 'Operations centre', 'National Maritime Centre', 'Fused tracking, incident and SAR, casualty, security levels', 'AIS/LRIT/VTS feeds; inter-agency accords'],
    ['5 · Continuous', 'Agent expansion', 'All', 'Agents promoted tier by tier as evidence accumulates', 'Measured accuracy; governance approval'],
  ], { y: 2.5, colW: [1.35, 2.0, 2.9, 3.9, 2.08], rowH: 0.52, size: 9.5 });
  const w = (CW - 0.9) / 4;
  const gv = [['Governance', 'Joint steering committee monthly; your programme director holds scope. Phase gates are signed by you, not reported to you.'],
              ['Team', 'Named individuals with committed allocation, not a rate card. Substitution requires your approval.'],
              ['Transfer', 'Your engineers embedded from Phase 1, not briefed at handover. Source and documentation in your repository throughout.'],
              ['Exit', 'Source-code escrow, documented runbooks, and a defined transition to your team or another supplier. Priced in, not negotiated later.']];
  gv.forEach((g, i) => card(s, M + i * (w + 0.3), 5.85, w, 1.2, { title: g[0], titleH: 0.28, body: g[1], size: 9.5 }));
}

/* 19 — RISK */
{
  const s = light('The risks in this programme, including the one that is us', 'Risk register',
    'A risk register that omits the supplier is not a risk register. Ours is listed first, with the mitigation you are entitled to demand.');
  table(s, [
    ['Risk', 'Likelihood', 'Impact', 'Mitigation'],
    [{ t: 'Supplier has no maritime production record', c: CRIT }, { t: 'Certain', c: CRIT, b: 1 }, 'High', 'Phase 0 proof of capability on your data with your exit criteria; payment gated on phase acceptance; source and configuration in your repository from day one; escrow and a costed exit path'],
    ['Legacy registry data incomplete or inconsistent', 'High', 'High', 'Data-quality assessment in Phase 0 before commitments are priced; migration with reconciliation reporting; a jointly owned remediation workstream, never silently absorbed'],
    ['Inter-agency dependencies stall the single window', 'High', 'High', 'Sequenced to Phase 3 after value has landed; agency onboarding tracked as a named dependency; the platform runs without any given agency, degraded rather than blocked'],
    ['Officers do not adopt the field app', 'Medium', 'High', 'Surveyors in the design from week 1; offline-first because a berth has no signal; must be faster than the paper form on day one or it has failed'],
    ['AI output trusted beyond its evidence', 'Medium', 'High', 'Autonomy tiers enforced technically, not by policy; mandatory citation; a standing accuracy review that can demote an agent’s tier'],
    ['Regulation changes mid-programme', 'High', 'Medium', 'The instrument base is the point — regulatory change is configuration, not a change request; the regulatory-intelligence agent surfaces the impact list'],
    ['Scope expands beyond the phase', 'High', 'Medium', 'The Core/Configure/Extend/Build catalogue is the scope baseline; anything marked Build enters a later phase by decision, not by drift'],
    ['External data feeds carry commercial terms', 'Medium', 'Medium', 'Satellite AIS, SAR tasking and commercial ship databases priced as pass-through and named in the commercial schedule — not discovered in year 2'],
    ['Key-person dependency', 'Medium', 'Medium', 'Named team with committed allocation; paired roles on every critical component; your engineers embedded from Phase 1'],
  ], { y: 2.35, colW: [3.1, 1.05, 0.85, 7.23], rowH: 0.46, size: 9.5 });
}

/* 20 — DIVIDER III */
divider('Part III', 'Agentic AI', 'Ten scoped agents, four enforced autonomy tiers, mandatory citation, and an audit ledger designed before the agent.', true);

/* 21 — AI NATIVE */
{
  const s = light('AI-native means the work arrives assembled', 'Not bolted on', 
    'Bolted-on AI adds a chat box to a form. AI-native changes what lands on the officer’s desk: not an application to process, but a dossier already read, cross-checked, sourced and flagged — with the decision left, deliberately, to the officer.', true);
  const w = (CW - 0.4) / 2;
  card(s, M, 2.35, w, 2.85, { kicker: 'Bolted on', kickerColor: MUTE, title: 'A chatbot beside the queue', titleH: 0.4,
    bullets: ['Answers questions about the process; does no part of it', 'Reads a knowledge base, not the live case record',
      'Cannot act, so its accuracy is never tested by consequence', 'Officer workload unchanged — the queue is the same length tomorrow',
      'Impressive in the demonstration, unused by month four'], size: 11 });
  card(s, M + w + 0.4, 2.35, w, 2.85, { kicker: 'AI-native', kickerColor: AMBER, line: 'E0CDA6', fill: 'FDFAF4',
    title: 'Agents inside the workflow', titleH: 0.4,
    bullets: ['An application enters the queue already assessed — documents read, entities extracted, registry cross-checked, gaps listed',
      'Every assertion carries a citation to the record or instrument that supports it',
      'Findings are ranked, and the uncertain ones are flagged as uncertain rather than smoothed over',
      'The officer’s first action is a judgement, not thirty minutes of assembly',
      'Accuracy is measured continuously, because it acts and the outcome is observable'], size: 10.5 });
  const cw2 = (CW - 0.6) / 3;
  const cmt = [['Grounded, not generative', 'Regulatory outputs are produced against the instrument base and the case record with mandatory citation. An assertion with no source is a defect, and is treated as one.'],
               ['Deterministic where it belongs', 'Fee calculation, certificate applicability and risk weighting are rules, not inference. Agents read, reason and draft; they do not compute what a rule engine should compute.'],
               ['Bilingual throughout', 'Arabic and English are equal citizens — in the instrument base, in agent reasoning, in generated circulars and in the citizen assistant. Not an English system with a translation layer.']];
  cmt.forEach((c, i) => card(s, M + i * (cw2 + 0.3), 5.55, cw2, 1.45, { title: c[0], titleH: 0.3, body: c[1], size: 10 }));
}

/* 22 — AGENT MESH */
{
  const s = light('Ten agents, each with a scope narrow enough to govern', 'The agent mesh',
    'One general-purpose assistant across a maritime administration is ungovernable — you cannot audit it, tier it, or demote it. Ten narrow agents can each be measured, evidenced and promoted independently.', true);
  table(s, [
    ['#', 'Agent', 'Domain', 'What it does, end to end', 'Launch tier'],
    ['01', 'Registry', '01', 'Reads builder’s certificate, bill of sale and deletion certificate; validates ship particulars; cross-checks IMO number and prior flag; walks the ownership chain and screens it against sanctions lists; returns a decision-ready dossier with every gap named', 'Tier 1'],
    ['02', 'Certification', '01', 'Derives the statutory certificate set for the vessel’s type, tonnage and trade; holds HSSC survey windows; opens renewal tasks ahead of expiry; detects endorsements outside their permitted window', 'Tier 1'],
    ['03', 'Risk & targeting', '05', 'Recomputes ship risk profiles as evidence arrives; produces the daily targeting list against arrivals; explains every placement by factor; proposes weighting changes with a backtest, never applying them itself', 'Tier 2'],
    ['04', 'Inspection copilot', '05', 'Briefs the surveyor before boarding on this ship’s history and its sister vessels’ recurring deficiencies; suggests deficiency codes from photograph and note; drafts the report and detention justification against convention references', 'Tier 1'],
    ['05', 'Regulatory intelligence', '03', 'Watches IMO, MoU and class circular feeds; diffs each change against the national instrument base; produces the downstream impact list; drafts the national circular in Arabic and English', 'Tier 2'],
    ['06', 'Seafarer verification', '02', 'Validates certificate authenticity with the issuing administration; tests declared sea service against vessel movement history and crew lists; detects tampering; runs STCW gap analysis before endorsement', 'Tier 1'],
    ['07', 'Port call orchestrator', '06', 'Reconciles FAL declarations across agent, customs, immigration and health submissions; catches missing or contradictory data before arrival rather than at the berth; sequences pilot, tug and berth', 'Tier 1'],
    ['08', 'Domain awareness', '04', 'Scores AIS gaps, spoofing indicators, ship-to-ship transfers and voyage deviation; corroborates across sources; raises attention with a stated confidence — and never initiates enforcement', 'Tier 3'],
    ['09', 'Licensing', '07', 'Tests completeness and eligibility against the licence matrix; schedules the inspection; drafts the technical evaluation; tracks conditions and prompts renewal before lapse', 'Tier 1'],
    ['10', 'Service assistant', 'All', 'The bilingual front door for owners, agents, seafarers and companies — explains requirements, pre-fills forms from held records, answers status queries, escalates to a named officer with full context', 'Tier 0/1'],
  ], { y: 2.4, colW: [0.5, 1.9, 0.8, 8.15, 0.88], rowH: 0.4, size: 9 });
  s.addText('Scoped authority. Each agent’s tool set is an explicit allow-list, enforced at the gateway rather than requested in a prompt. The inspection copilot cannot alter a registry record; the service assistant cannot read enforcement files.', {
    x: M, y: 6.6, w: CW, h: 0.4, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0 });
}

/* 23 — TIERS */
{
  const s = light('Four tiers, enforced in code, earned with evidence', 'Autonomy',
    '“Human in the loop” is a slogan until you say precisely which loop and which human. These four tiers are technical settings on each agent — and an agent moves up only on measured accuracy, approved by your governance board.', true);
  const w = (CW - 0.9) / 4;
  const tiers = [
    ['Tier 0 — Autonomous', OK, 'Acts without review', 'Reversible, non-consequential, fully verifiable actions.', ['Status lookups and notifications', 'Reminders before expiry', 'Document classification and filing', 'Data-quality flagging'], 'Reversal: automatic, no consequence.'],
    ['Tier 1 — Drafts', SEA, 'Officer approves before effect', 'The agent produces the complete output; nothing takes effect until a named officer signs.', ['Registration dossiers and assessments', 'Inspection reports and deficiency codes', 'Licence technical evaluations', 'Circular drafts, both languages'], 'Reversal: reject the draft — nothing has happened.'],
    ['Tier 2 — Advises', AMBER, 'Officer decides with evidence', 'The agent assembles and argues; it does not draft the decision. The officer’s reasoning is the record.', ['Targeting recommendations', 'Risk-weighting change proposals', 'Regulatory impact assessments', 'Anomaly escalations'], 'Reversal: not applicable — the human decided.'],
    ['Tier 3 — Excluded', CRIT, 'Never AI-determined', 'Decisions with legal consequence for a person or vessel. AI may inform the file; it may not produce the finding.', ['Detention and release', 'Licence suspension or revocation', 'Casualty investigation findings', 'Prosecution and penalty', 'Certificate withdrawal'], 'Enforcement: the tool is not exposed to the agent.'],
  ];
  tiers.forEach((t, i) => {
    const x = M + i * (w + 0.3);
    card(s, x, 2.4, w, 3.62, { kicker: t[0], kickerColor: t[1], title: t[2], titleH: 0.56, body: t[3], bodyH: 0.72, bullets: t[4], size: 9.5 });
    s.addText(t[5], { x: x + 0.24, y: 6.12, w: w - 0.48, h: 0.4, fontFace: BODY, fontSize: 9,
      italic: true, color: t[1], margin: 0 });
  });
  s.addText('Promotion is earned. An agent enters service at its launch tier. Moving up requires a defined volume of decisions at a measured accuracy threshold, reviewed by your AI governance board and recorded as a versioned change — and accuracy falling below the threshold demotes it automatically. Promotion is a decision; demotion is a mechanism.', {
    x: M, y: 6.62, w: CW, h: 0.6, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.1 });
}

/* 24 — TRUST */
{
  const s = light('Every agent action is a record you can subpoena', 'Trust & audit',
    'A maritime administration is auditable by the IMO, by its own state audit office, and eventually by a tribunal. An AI action that cannot be reconstructed two years later is not usable in that setting — so the ledger is designed first and the agent second.', true);
  table(s, [
    ['Written on every agent action', 'Why it is there'],
    ['Agent, version, tier', 'Which agent acted, under which released configuration, at what authority'],
    ['Model and prompt fingerprint', 'Reproducibility — the same inputs can be re-run against the same model version'],
    ['Inputs consulted', 'Every record, document and instrument the agent actually read, by identifier and version'],
    ['Tool calls made', 'Each governed API call, with parameters and result — the complete action trail'],
    ['Citations', 'The specific clause, record or precedent behind each assertion in the output'],
    ['Confidence and uncertainty', 'What the agent was unsure of, stated at the time and not reconstructed later'],
    ['Human disposition', 'Who reviewed it, what they changed, whether they accepted or rejected, and why'],
    ['Outcome linkage', 'What eventually happened — which is what makes accuracy measurable rather than asserted'],
  ], { y: 2.5, w: CW * 0.58, colW: [2.7, 5.03], rowH: 0.42, size: 10 });
  card(s, M + CW * 0.61, 2.5, CW * 0.39, 3.15, { line: 'E0CDA6', fill: 'FDFAF4',
    title: 'Guardrails that hold', titleH: 0.36,
    bullets: ['Citation is mandatory — an unsourced assertion is suppressed and logged as a defect, not shown with a hedge',
      'Tool allow-lists at the gateway — prompt injection in an uploaded document cannot reach an ungranted tool',
      'Untrusted content is fenced — applicant documents and external feeds are data to be analysed, never instructions to follow',
      'PII minimised at the boundary — redaction before any external model call; classification-driven routing',
      'Deterministic fallback — model unavailability slows the administration, it never stops it'], size: 10 });
  s.addText('The metric that matters. Officers rejecting agent drafts is the honest signal of quality. We instrument it from day one, report it to your governance board, and treat a rising rate as a defect in the agent rather than as resistance from the officer.', {
    x: M + CW * 0.61, y: 5.8, w: CW * 0.39, h: 0.9, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 25 — IMPACT */
{
  const s = light('Where the officer’s time actually goes', 'Modelled impact',
    'The arithmetic, shown rather than summarised. Every reduction below is modelled — derived from the task decomposition in column two, not measured in a prior deployment.', true);
  table(s, [
    ['Process', 'What consumes the time today', 'What the agent removes', 'Modelled'],
    ['Ship registration', 'Reading and re-keying documents; chasing missing papers; manual ownership and sanctions checks; assembling the file for review', 'Extraction, cross-checking, gap listing and dossier assembly — the officer receives a complete file and decides', { t: '−50 to 70%\nhandling time', c: AMBER, b: 1 }],
    ['Certificate renewal', 'Manual tracking of expiry across a fleet; late discovery of lapsed certificates; reactive chasing', 'Derived matrix, window monitoring, and tasks opened before expiry rather than after', { t: 'Lapses →\nnear zero', c: AMBER, b: 1 }],
    ['PSC inspection', 'Pre-boarding history research; on-board note-taking; report typed back at the office; code lookup', 'Briefing pack, on-device capture, code suggestion, report drafted before the surveyor leaves the ship', { t: '−40 to 60%\nreport time', c: AMBER, b: 1 }],
    ['Inspection targeting', 'Manual list-building; targeting on what is visible rather than what is risky', 'Continuous recomputation against live arrivals, with the selection explained', { t: 'Deficiency\nhit-rate ↑', c: AMBER, b: 1 }],
    ['Seafarer endorsement', 'Manual verification with issuing administrations; sea service checked against the applicant’s own declaration', 'Automated verification and cross-checking against vessel movements and crew lists', { t: '−50 to 65%\ncycle time', c: AMBER, b: 1 }],
    ['Port call clearance', 'Same data submitted repeatedly to separate agencies; errors surfacing at the berth', 'Once-only submission; contradictions caught pre-arrival, when they are still cheap to fix', { t: '−60 to 80%\nsubmissions', c: AMBER, b: 1 }],
    ['Circular issuance', 'Manual impact analysis across checklists and forms; bilingual drafting and review', 'Impact list generated from the instrument chain; bilingual draft prepared for legal review', { t: 'Weeks →\ndays', c: AMBER, b: 1 }],
  ], { y: 2.35, colW: [1.75, 4.5, 4.5, 1.48], rowH: 0.56, size: 9.5 });
  s.addText('Read the middle columns, not the last one. Any vendor can print a percentage. The question your evaluators should ask is whether the described task actually decomposes the way column three claims — if it does not, the number is worthless. These become commitments in Phase 0: week 0 measures your real baseline, week 8 measures the same process on the platform. From that point the numbers stop being modelled and start being observed.', {
    x: M, y: 6.35, w: CW, h: 0.7, fontFace: BODY, fontSize: 10.5, italic: true, color: MID, margin: 0, lineSpacingMultiple: 1.12 });
}

/* 26 — CLOSE */
{
  const s = pres.addSlide();
  s.background = { color: INK };
  s.addText('CLOSE', { x: M, y: 0.7, w: CW, h: 0.3, fontFace: BODY, fontSize: 11, bold: true, color: SEALT, charSpacing: 4, margin: 0 });
  s.addText('What we would like to agree today', { x: M, y: 1.1, w: CW * 0.8, h: 0.85,
    fontFace: HEAD, fontSize: 36, bold: true, color: WHITE, margin: 0 });
  s.addText('Not a contract. A structured week that tells you more about us than any reference call would — and costs you a room and four of your officers.', {
    x: M, y: 2.0, w: CW * 0.66, h: 0.6, fontFace: BODY, fontSize: 13.5, color: 'AAC1C7', margin: 0, lineSpacingMultiple: 1.15 });
  const w = (CW - 0.6) / 3;
  const steps = [['Step one', 'Two days with your officers', 'Your service catalogue on the wall, marked live against Core / Configure / Extend / Build. You will see how we handle the services that do not fit — the only part that tells you anything.', SEALT],
                 ['Step two', 'Exit criteria, signed before we start', 'You choose the pilot service and define what success means in week 8. We do not get to mark our own work.', SEALT],
                 ['Step three', 'Proof of capability on your data', 'Eight weeks. One service, in your environment, with one agent in Tier 1. Then you decide about the programme — with evidence instead of a proposal.', AMBLT]];
  steps.forEach((st, i) => {
    const x = M + i * (w + 0.3);
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.95, w, h: 2.25, rectRadius: 0.06,
      fill: { color: '0F2A38' }, line: { color: '1C3F4F', width: 1 } });
    s.addText(st[0].toUpperCase(), { x: x + 0.26, y: 3.15, w: w - 0.52, h: 0.24, fontFace: BODY,
      fontSize: 9, bold: true, color: st[3], charSpacing: 2, margin: 0 });
    s.addText(st[1], { x: x + 0.26, y: 3.42, w: w - 0.52, h: 0.6, fontFace: HEAD, fontSize: 15,
      bold: true, color: WHITE, margin: 0, valign: 'top' });
    s.addText(st[2], { x: x + 0.26, y: 4.05, w: w - 0.52, h: 1.05, fontFace: BODY, fontSize: 10.5,
      color: 'AAC1C7', margin: 0, valign: 'top', lineSpacingMultiple: 1.14 });
  });
  s.addText('The argument in one line', { x: M, y: 5.55, w: CW * 0.45, h: 0.35, fontFace: HEAD,
    fontSize: 16, bold: true, color: WHITE, margin: 0 });
  s.addText('The platform capability is real and demonstrable, the maritime track record is not yet there, and the proposal is built so that the second fact costs you nothing to verify.', {
    x: M, y: 5.9, w: CW * 0.56, h: 0.8, fontFace: BODY, fontSize: 13, color: SEALT, margin: 0, lineSpacingMultiple: 1.18 });
  s.addNotes('Close on the one-liner. Then ask for the two-day working session — that is the only commitment being requested in this meeting.');
}

const out = path.join(__dirname, '..', 'dist', 'maritime-platform-capability.pptx');
pres.writeFile({ fileName: out }).then(() => console.log('wrote ' + out));
