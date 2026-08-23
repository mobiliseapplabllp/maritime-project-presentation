// Project presentation — dist/mundra-portal-project-presentation.pptx
// Purpose → module list → 2 pages per module (delivered functionality + process
// flowchart) → technical section (stack, 3-tier architecture, Dev/UAT/Prod,
// Security & VAPT, AI, delivery summary). Simple visual language throughout.
const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
pres.author = 'Mobilise App Lab';
pres.title = 'Mundra Port Operations Portal — project presentation';

const W = 13.333, H = 7.5;
const NAVY = '0A2239';
const TEAL = '0E7C86';
const AMBER = 'B77817';
const INK = '15242E';
const MUTE = '5C7078';
const LINE = 'C8D4D6';
const WHITE = 'FFFFFF';
const PAPER = 'F6F8F8';
const BODY = 'Calibri';

/* ---------------- helpers ---------------- */
function header(s, kicker, title, color) {
  s.background = { color: WHITE };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: color || NAVY } });
  s.addText(kicker.toUpperCase(), {
    x: 0.65, y: 0.4, w: W - 1.3, h: 0.32, fontFace: BODY, fontSize: 11.5, bold: true,
    color: color || TEAL, charSpacing: 3, margin: 0,
  });
  s.addText(title, {
    x: 0.62, y: 0.72, w: W - 1.3, h: 0.62, fontFace: BODY, fontSize: 26, bold: true,
    color: INK, margin: 0,
  });
}

function bullets(s, items, x, y, w, h, opts = {}) {
  s.addText(items.map((t, i) => ({
    text: t,
    options: {
      fontSize: opts.fontSize || 13.5, color: opts.color || '2E4450', breakLine: true,
      bullet: { code: '2022', indent: 14 },
      paraSpaceAfter: i === items.length - 1 ? 0 : (opts.gap ?? 8),
    },
  })), { x, y, w, h, fontFace: BODY, valign: 'top', lineSpacingMultiple: 1.08 });
}

/* flowchart: serpentine rows of rounded boxes with arrows.
   node = { t: 'text', kind: 'start'|'step'|'alt'|'end' } */
function flow(s, nodes, opts = {}) {
  const perRow = opts.perRow || 4;
  const mx = 0.7, gap = 0.55;
  const bw = (W - mx * 2 - gap * (perRow - 1)) / perRow;
  const bh = 1.02;
  const rowYs = [opts.y0 || 2.15, (opts.y0 || 2.15) + 1.85, (opts.y0 || 2.15) + 3.7];
  const fillOf = { start: TEAL, end: NAVY, step: WHITE, alt: 'FBEEDA' };
  const txtOf = { start: WHITE, end: WHITE, step: INK, alt: '7A5210' };
  const lineOf = { start: TEAL, end: NAVY, step: '9FB4BC', alt: 'D9A94E' };

  nodes.forEach((n, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rtl = row % 2 === 1; // serpentine
    const x = rtl ? (W - mx - bw - col * (bw + gap)) : (mx + col * (bw + gap));
    const y = rowYs[row];
    s.addText(n.t, {
      shape: pres.ShapeType.roundRect, rectRadius: 0.07,
      x, y, w: bw, h: bh, align: 'center', valign: 'middle',
      fontFace: BODY, fontSize: 12, bold: n.kind !== 'step', color: txtOf[n.kind] || INK,
      fill: { color: fillOf[n.kind] || WHITE },
      line: { color: lineOf[n.kind] || '9FB4BC', width: n.kind === 'step' ? 1.25 : 0 },
      shadow: { type: 'outer', angle: 90, blur: 5, offset: 1, color: '0A2239', opacity: 0.14 },
      margin: 4,
    });
    if (i === nodes.length - 1) return;
    const nRow = Math.floor((i + 1) / perRow);
    if (nRow === row) {
      // horizontal arrow between neighbours
      const ax = rtl ? x - gap + 0.06 : x + bw + 0.06;
      s.addShape(pres.ShapeType.line, {
        x: ax, y: y + bh / 2, w: gap - 0.12, h: 0,
        line: { color: '76909B', width: 2.2, ...(rtl ? { beginArrowType: 'triangle' } : { endArrowType: 'triangle' }) },
      });
    } else {
      // vertical drop to next row (same x, boxes vertically aligned at serpentine turn)
      s.addShape(pres.ShapeType.line, {
        x: x + bw / 2, y: y + bh + 0.05, w: 0, h: rowYs[nRow] - y - bh - 0.1,
        line: { color: '76909B', width: 2.2, endArrowType: 'triangle' },
      });
    }
  });
  if (opts.legend !== false) {
    const ly = 6.85;
    const leg = [[TEAL, 'Start'], ['FFFFFF', 'Process step'], ['FBEEDA', 'Check / alert'], [NAVY, 'Outcome']];
    let lx = 0.72;
    leg.forEach(([c, label]) => {
      s.addShape(pres.ShapeType.roundRect, { x: lx, y: ly, w: 0.3, h: 0.2, rectRadius: 0.04, fill: { color: c }, line: { color: '9FB4BC', width: 0.75 } });
      s.addText(label, { x: lx + 0.36, y: ly - 0.05, w: 1.6, h: 0.3, fontFace: BODY, fontSize: 10.5, color: MUTE, margin: 0 });
      lx += 2.0;
    });
  }
}

function chips(s, items, y, color) {
  let x = 0.68;
  items.forEach((t) => {
    const w = 0.32 + t.length * 0.082;
    s.addText(t, {
      shape: pres.ShapeType.roundRect, rectRadius: 0.09, x, y, w, h: 0.4,
      align: 'center', valign: 'middle', fontFace: BODY, fontSize: 11.5, bold: true,
      color: color || NAVY, fill: { color: PAPER }, line: { color: LINE, width: 1 }, margin: 2,
    });
    x += w + 0.22;
  });
}

/* ---------------- 1. title ---------------- */
const ASSETS = path.join(__dirname, 'assets');
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 5.0, w: W, h: 0.06, fill: { color: TEAL } });
  s.addImage({ path: path.join(ASSETS, 'adani-white.png'), x: W - 2.6, y: 0.6, w: 1.89, h: 0.6 });
  s.addText('PROJECT PRESENTATION', {
    x: 0.95, y: 1.4, w: 10, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: '7FC7CC', charSpacing: 3, margin: 0 });
  s.addText('Mundra Port\nOperations Portal', {
    x: 0.9, y: 1.95, w: 11.5, h: 2.2, fontFace: BODY, fontSize: 46, bold: true, color: WHITE, margin: 0, lineSpacingMultiple: 1.02 });
  s.addText('Purpose · Modules & functionality delivered · Process flows · Technology, architecture & security', {
    x: 0.95, y: 4.3, w: 11.4, h: 0.5, fontFace: BODY, fontSize: 16, color: 'B9CBD3', margin: 0 });
  s.addText('August 2026', { x: 0.95, y: 5.3, w: 6, h: 0.4, fontFace: BODY, fontSize: 13, color: '7A93A0', margin: 0 });
  s.addImage({ path: path.join(ASSETS, 'mobilise-badge-white.png'), x: 0.95, y: 6.35, w: 0.42, h: 0.42 });
  s.addText([
    { text: 'POWERED BY\n', options: { fontSize: 8.5, color: '7A93A0', charSpacing: 2 } },
    { text: 'Mobilise App Lab', options: { fontSize: 13, bold: true, color: WHITE } },
    { text: '  ·  mobilise.co.in', options: { fontSize: 10, color: '7FC7CC' } },
  ], { x: 1.5, y: 6.3, w: 6, h: 0.55, fontFace: BODY, valign: 'middle', margin: 0 });
  s.addNotes('SAY: This presentation covers what the portal is for, the twelve modules and what each one delivers, a simple process flow for every module, and then the technical section — stack, architecture, environments and security.');
}

/* ---------------- 2. purpose ---------------- */
{
  const s = pres.addSlide();
  header(s, 'Why this portal exists', 'Purpose');
  bullets(s, [
    'Bring the port’s daily work — vessels, berths, crew, incidents, inspections, companies and billing — into one system with one login.',
    'Replace registers, spreadsheets and phone-call coordination with structured workflows and a single source of truth.',
    'Give management a live picture: berth occupancy, traffic, cargo, safety response and revenue on one screen.',
    'Standardise statutory routine — the daily berthing report, notices with acknowledgments, survey checklists, GST invoices.',
    'Keep the port in control of its own system: masters, settings, roles and reports are managed by port staff, not the vendor.',
    'Provide a grounded AI assistant that answers from the port’s own records.',
  ], 0.75, 1.75, W - 1.6, 4.6, { fontSize: 16, gap: 14 });
  s.addNotes('SAY: One system for the whole port, replacing scattered registers and calls; live visibility for management; statutory routine standardised; and the port stays in control of its own configuration.');
}

/* ---------------- 3. modules ---------------- */
const MODULES = [
  ['Command Centre', '0B74B0', 'Live KPIs, berth board and charts the moment you sign in'],
  ['Harbour Operations', '0797A5', 'Vessel calls end-to-end — VCN to sailing, berth planning, live traffic'],
  ['Fleet Manager', '3B6FB6', 'Vessel registry, certificates, voyages and risk profiles'],
  ['Crew & Manning', '75479C', 'Seafarer records, documents, sign-on/off and expiry watch'],
  ['Notices & Circulars', '8A5A2B', 'Publish instruments and track organisation-wide acknowledgment'],
  ['Incident Desk', 'B3452E', 'HSE & marine incidents as numbered case files to closure'],
  ['Survey & Audit Cell', '9C6412', 'Own checklists, surveys, findings, detentions and dashboards'],
  ['Port Companies', '2C6E52', 'Company directory and the full licence lifecycle'],
  ['Revenue & Billing', 'BD3861', 'Tariff-driven GST invoices, collections and ageing'],
  ['MIS Reports', '0B5D8A', '24 pre-seeded reports incl. the Daily Berthing Report'],
  ['Data Studio', '5A6B78', '19 configuration masters with full CRUD and exports'],
  ['Administration', '0A2239', 'Roles, users, audit trail and platform settings'],
];
{
  const s = pres.addSlide();
  header(s, 'One portal · twelve applications', 'Modules delivered');
  const cw = (W - 1.3 - 0.4 * 2) / 3, ch = 1.28, gy = 0.18;
  MODULES.forEach(([name, color, desc], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.65 + col * (cw + 0.4), y = 1.62 + row * (ch + gy);
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.06, fill: { color: WHITE }, line: { color: LINE, width: 1 }, shadow: { type: 'outer', angle: 90, blur: 4, offset: 1, color: '0A2239', opacity: 0.10 } });
    s.addShape(pres.ShapeType.rect, { x, y, w: 0.09, h: ch, fill: { color } });
    s.addText(name, { x: x + 0.22, y: y + 0.12, w: cw - 0.35, h: 0.34, fontFace: BODY, fontSize: 14.5, bold: true, color: INK, margin: 0 });
    s.addText(desc, { x: x + 0.22, y: y + 0.47, w: cw - 0.35, h: 0.75, fontFace: BODY, fontSize: 10.8, color: MUTE, margin: 0, valign: 'top' });
  });
  s.addNotes('SAY: Twelve applications behind one launcher. Each person sees only the ones their role allows. The next slides take each module — what is delivered, then its process flow.');
}

/* ---------------- module pages (2 per module) ---------------- */
const MOD_PAGES = [
  {
    name: 'Command Centre', color: '0B74B0',
    fn: [
      'Live KPI cards — vessels at berth, anchorage, cargo MTD, arrivals 72 h, open detentions',
      'Cargo throughput chart by cargo group (12 months)',
      'Billed revenue trend and berth board with live vessel/ETD per berth',
      'Traffic and safety snapshots with drill-down into modules',
      'Role-aware: each user’s launcher and dashboard show only permitted areas',
      'Dark / light theme, Adani-style branding, responsive layout',
    ],
    facts: ['Live from all modules', 'Role-based visibility', 'One-glance operations'],
    flow: [
      { t: 'Activity recorded across modules', kind: 'start' },
      { t: 'KPIs & boards computed live', kind: 'step' },
      { t: 'Command Centre renders role view', kind: 'step' },
      { t: 'Anomaly visible (waiting, overdue, open cases)', kind: 'alt' },
      { t: 'One-click drill-down to the module screen', kind: 'step' },
      { t: 'Decision taken on live data', kind: 'end' },
    ],
    note: 'Every figure on the dashboard is computed from the same records the modules write — there is no separate reporting database to reconcile.',
  },
  {
    name: 'Harbour Operations', color: '0797A5',
    fn: [
      'Vessel call lifecycle: announce (auto VCN) → confirm → anchorage → berth → sail',
      'Berth board (24 berths) with conflict detection and berth CRUD',
      'Vessel schedule board and expected line-up',
      '2D quay view of who is on every berth',
      'Live traffic map with AIS-style positions and zone alerts (side menu)',
      'Marine craft & pilot roster — tugs, launches, current tasking',
      'Cargo operations per call: load/discharge lines with quantities and UOMs',
      'Module settings: VCN prefix, tug defaults, anchorage alert, speed limits',
    ],
    facts: ['24 berths', '402 vessel calls preloaded', 'VCN auto-numbering'],
    flow: [
      { t: 'Agent announces call — VCN issued', kind: 'start' },
      { t: 'Confirmed & scheduled to a berth', kind: 'step' },
      { t: 'At anchorage — waiting tracked', kind: 'step' },
      { t: 'Pilot & tugs assigned', kind: 'step' },
      { t: 'Berthed — cargo operations recorded', kind: 'step' },
      { t: 'Conflict / delay flagged on the board', kind: 'alt' },
      { t: 'Sailed — actuals captured', kind: 'step' },
      { t: 'Call handed to Billing', kind: 'end' },
    ],
    note: 'Status changes follow a controlled workflow — a call cannot jump states, and every transition is audit-logged.',
  },
  {
    name: 'Fleet Manager', color: '3B6FB6',
    fn: [
      'Vessel registry with particulars, ownership, class society and agent',
      'Fleet dashboard: composition, age profile, certificate health',
      '8-tab vessel file: overview, certificates, voyages, movements, crew, incidents, inspections, risk',
      'Certificate tracking with EXPIRING window (driven by module settings)',
      'Voyage history and port movements with trade-lane summary',
      'Explainable risk score per vessel and survey targeting list',
      'Excel / PDF export on registers and certificate reports',
    ],
    facts: ['31 vessels', 'Certificate expiry alerts', 'Risk scoring'],
    flow: [
      { t: 'Vessel registered with particulars', kind: 'start' },
      { t: 'Certificates recorded', kind: 'step' },
      { t: 'Expiry watch — EXPIRING / EXPIRED flags', kind: 'alt' },
      { t: 'Calls, voyages & movements accumulate', kind: 'step' },
      { t: 'Risk score computed (explainable factors)', kind: 'step' },
      { t: 'High-risk vessels on targeting list', kind: 'alt' },
      { t: 'Survey planned in Audit Cell', kind: 'end' },
    ],
    note: 'The certificate window (days) is a crew-of-one change in Fleet settings — statuses, stat cards and reports update immediately.',
  },
  {
    name: 'Crew & Manning', color: '75479C',
    fn: [
      'Seafarer register — identity, rank, CDC, INDoS, nationality, contact',
      'Documents per seafarer: CoC, GMDSS, medical (ILO/MLC), STCW, CDC',
      'Sign-on / sign-off to vessels with verified sea-service records',
      'Crew dashboard: roll strength, rank mix, document expiry funnel, needs-attention list',
      '6 crew reports incl. medical fitness register, CoC register, sea-service summary',
      'Medical expiry window and rest-hour rules from module settings',
    ],
    facts: ['18 ranks supported', 'Expiry funnel', '6 crew reports'],
    flow: [
      { t: 'Seafarer enrolled on the roll', kind: 'start' },
      { t: 'Documents & certificates recorded', kind: 'step' },
      { t: 'Signed on to a vessel', kind: 'step' },
      { t: 'Expiry watch — medical / CoC / STCW', kind: 'alt' },
      { t: 'Renewal completed, record updated', kind: 'step' },
      { t: 'Sign-off — sea service verified', kind: 'step' },
      { t: 'Reports: roster, medicals, sea service', kind: 'end' },
    ],
    note: 'The dashboard’s "needs attention first" list orders people by flagged documents, so renewals happen before a lapse — not after.',
  },
  {
    name: 'Notices & Circulars', color: '8A5A2B',
    fn: [
      'Instrument library: acts, rules, circulars, notices, orders, conventions',
      'Lifecycle: draft → in force → superseded / withdrawn',
      'Acknowledgment flow — publish with "acknowledgment required"',
      'Per-instrument acknowledgment status with user list and % coverage',
      'Notice Acknowledgment Status report in the MIS library',
      'Defaults (ack required, reminder days) from module settings',
    ],
    facts: ['6 instrument types', 'Org-wide acknowledgments', 'Compliance %'],
    flow: [
      { t: 'Instrument drafted with reference no.', kind: 'start' },
      { t: 'Published — in force', kind: 'step' },
      { t: 'Acknowledgment required?', kind: 'alt' },
      { t: 'Staff acknowledge in the portal', kind: 'step' },
      { t: 'Coverage tracked (% of users)', kind: 'step' },
      { t: 'Superseded / archived with history', kind: 'end' },
    ],
    note: 'Acknowledgments are individually recorded — the register shows exactly who has and has not read a mandatory circular.',
  },
  {
    name: 'Incident Desk', color: 'B3452E',
    fn: [
      'Case files with auto numbering (INC-YYYY-NNNN) across 15 incident types',
      'Lifecycle: open → acknowledged → responding → monitoring → resolved → closed (+ controlled reopen)',
      'Per case: communications log, documents, task assignments, status timeline, RCA',
      'Resource dispatch — tugs, pilot launches, patrol assets',
      'Dashboard: MTTA / MTTR against targets, severity and category mix, hotspots',
      'Locations and document types come from Data Studio masters',
      'SLA targets and auto-notify severity set in module settings',
    ],
    facts: ['110 cases preloaded', 'MTTA / MTTR tracked', 'Full RCA trail'],
    flow: [
      { t: 'Incident reported (VHF / phone / patrol / portal)', kind: 'start' },
      { t: 'Case opened — INC number, severity, priority', kind: 'step' },
      { t: 'Acknowledged — MTTA clock stops', kind: 'step' },
      { t: 'Response: tasks, comms, resources', kind: 'step' },
      { t: 'Escalation if SLA breached', kind: 'alt' },
      { t: 'Resolved — MTTR recorded', kind: 'step' },
      { t: 'Root-cause analysis captured', kind: 'step' },
      { t: 'Closed (reopen window applies)', kind: 'end' },
    ],
    note: 'Every action on a case lands in its timeline, so the file reads like a complete story during review or investigation.',
  },
  {
    name: 'Survey & Audit Cell', color: '9C6412',
    fn: [
      'Checklist Builder: create checklist types, add / edit / delete / reorder questions',
      'Question options: answer type, weightage, critical flag, guidance text; template versioning',
      'Survey register across PSC / FSI / ISM / ISPS / MLC with findings and action codes',
      'Detention handling with grounds and release tracking',
      'Audit dashboard: open surveys, satisfaction %, detention rate, checklist compliance %',
      '3 dedicated reports: deficiency analysis, detention register, checklist compliance',
      'Pass score and rectification defaults from module settings',
    ],
    facts: ['5 checklist templates', 'Question-level CRUD', 'Compliance dashboards'],
    flow: [
      { t: 'Checklist type created', kind: 'start' },
      { t: 'Questions added — weightage & critical flags', kind: 'step' },
      { t: 'Survey planned against a vessel / facility', kind: 'step' },
      { t: 'Conducted — answers & findings recorded', kind: 'step' },
      { t: 'Detainable finding?', kind: 'alt' },
      { t: 'Rectification tracked to due date', kind: 'step' },
      { t: 'Survey closed with result', kind: 'step' },
      { t: 'Dashboards & reports update', kind: 'end' },
    ],
    note: 'Templates are versioned — editing a checklist bumps its version, and past surveys keep the version they were conducted with.',
  },
  {
    name: 'Port Companies', color: '2C6E52',
    fn: [
      'Directory of agencies, terminal operators, service providers and suppliers',
      'Company file: contacts, GSTIN / PAN, rating, licences held, active vessel calls',
      'Licence lifecycle: applied → under review → issued → suspended / revoked',
      '10 licence types (shipping agency, bunker supplier, surveyor, stevedore…)',
      'Performance rating per company; blacklist / suspension status',
      'Licence Register report with validity and ratings',
    ],
    facts: ['18 companies preloaded', '10 licence types', 'Full licence lifecycle'],
    flow: [
      { t: 'Company onboarded to the directory', kind: 'start' },
      { t: 'Licence application filed', kind: 'step' },
      { t: 'Scrutiny — documents & fitness', kind: 'step' },
      { t: 'Approved? (issue / reject)', kind: 'alt' },
      { t: 'Licence issued with validity', kind: 'step' },
      { t: 'Performance rated over time', kind: 'step' },
      { t: 'Renewal — or suspension / revocation', kind: 'end' },
    ],
    note: 'A company’s file brings its licences and current vessel calls together, so scrutiny and renewals happen with full context.',
  },
  {
    name: 'Revenue & Billing', color: 'BD3861',
    fn: [
      'Tariff master (11 heads) driving invoice lines — port dues, pilotage, berth hire, cargo',
      'Invoice lifecycle: draft → issued → paid / cancelled with payment references',
      'GST applied per settings (rate, place of supply, SAC code); amounts in ₹',
      'Auto invoice numbering with configurable prefix',
      'Reports: outstanding ageing (0–30 / 31–60 / 61–90 / 90+), collections, revenue by head',
      'Payment terms and reminder cadence from module settings',
    ],
    facts: ['263 invoices preloaded', 'GST-ready', 'Ageing & collections MIS'],
    flow: [
      { t: 'Services consumed on a vessel call', kind: 'start' },
      { t: 'Invoice drafted from tariff heads', kind: 'step' },
      { t: 'GST computed per settings', kind: 'step' },
      { t: 'Issued to the agent / company', kind: 'step' },
      { t: 'Overdue? — ageing bucket & reminder', kind: 'alt' },
      { t: 'Payment recorded with reference', kind: 'step' },
      { t: 'Collections & revenue MIS', kind: 'end' },
    ],
    note: 'Change the GST rate or invoice prefix in settings and every new invoice uses it — no code change involved.',
  },
  {
    name: 'MIS Reports', color: '0B5D8A',
    fn: [
      'Report Library — 24 pre-seeded reports across every module on one page',
      'Daily Berthing Report in the published Mundra format: 7-day tide table, vessels at berth incl. vacant berths with FWD/AFT drafts, sailed 48 h, anchorage, expected line-up',
      'Operations, fleet, crew, notices, incidents, surveys, companies, finance and admin reports',
      'Viewer with Re-run, Excel, PDF (branded) and Print on every report',
      'Interactive MIS report with cargo, revenue and compliance charts',
      'Default period and export footer from module settings',
    ],
    facts: ['24 reports', 'Berthing report replica', 'Excel + PDF everywhere'],
    flow: [
      { t: 'Report picked from the library', kind: 'start' },
      { t: 'Runs on live operational data', kind: 'step' },
      { t: 'Sectioned view rendered', kind: 'step' },
      { t: 'Re-run any time — always current', kind: 'step' },
      { t: 'Export: Excel / PDF / Print', kind: 'end' },
    ],
    note: 'The berthing report follows the same section order as the port’s published daily report, so recipients read it without retraining.',
  },
  {
    name: 'Data Studio', color: '5A6B78',
    fn: [
      '19 masters: countries, states, cities, ports, UOMs, currencies, agents, vessel & cargo types, equipment types, equipment & assets, departments, designations, shifts, holidays, document types, incident locations, deficiency & PSC action codes',
      'Grouped hub (geography / commercial / marine / assets / organisation / compliance) with live counts',
      'Full CRUD on every master with icons, stat cards and meta fields (e.g. equipment capacity, make)',
      'Excel / PDF / CSV export on every master',
      'Masters feed module dropdowns and validation — incl. incident locations & document types',
      'Berths, tariffs and checklist templates managed alongside as dedicated masters',
    ],
    facts: ['19 masters', '225 entries preloaded', 'Used across all modules'],
    flow: [
      { t: 'Master entry added / edited by port staff', kind: 'start' },
      { t: 'Code & label validated', kind: 'step' },
      { t: 'Available across modules instantly', kind: 'step' },
      { t: 'Used in forms, filters & reports', kind: 'step' },
      { t: 'Exportable register (Excel / PDF)', kind: 'end' },
    ],
    note: 'When rules or geography change, the port edits a master — every dependent screen picks it up without a release.',
  },
  {
    name: 'Administration', color: '0A2239',
    fn: [
      'Role-based access control — 12 roles over 21 permission groups (view / create / edit / approve…)',
      'User management: 128 seeded users with department, designation and role',
      'Full audit trail — who did what, when, on which record',
      'Global settings: organisation, operations, billing & tax, notifications, SMTP (with test), AI assistant',
      'Per-module settings pages that loop back into module behaviour instantly',
      'Secrets masked in the UI (SMTP password, AI key); JWT session management',
    ],
    facts: ['12 roles', '21 permission groups', '128 users seeded'],
    flow: [
      { t: 'Role defined with permissions', kind: 'start' },
      { t: 'User created — dept, designation, role', kind: 'step' },
      { t: 'Secure sign-in (JWT + refresh)', kind: 'step' },
      { t: 'Every action audit-logged', kind: 'step' },
      { t: 'Settings tuned (global + per module)', kind: 'step' },
      { t: 'Behaviour updates live — no restart', kind: 'end' },
    ],
    note: 'Access is deny-by-default: a screen, action or API is available only when the signed-in role carries that exact permission.',
  },
];

MOD_PAGES.forEach((m, idx) => {
  /* page A — functionality delivered */
  const a = pres.addSlide();
  header(a, `Module ${idx + 1} of 12`, `${m.name} — delivered functionality`, m.color);
  bullets(a, m.fn, 0.75, 1.66, W - 1.5, 4.7, { fontSize: 13.5, gap: 9 });
  a.addShape(pres.ShapeType.rect, { x: 0, y: 6.62, w: W, h: 0.02, fill: { color: LINE } });
  chips(a, m.facts, 6.85, m.color);
  a.addNotes(`SAY: ${m.name} — read two or three bullets that matter to this audience, then move to the flow. All of this is delivered and working in the portal today.`);

  /* page B — process flow */
  const b = pres.addSlide();
  header(b, `Module ${idx + 1} of 12 · process flow`, `${m.name} — how it works`, m.color);
  flow(b, m.flow);
  b.addText(m.note, {
    x: 0.72, y: 6.28, w: W - 1.5, h: 0.5, fontFace: BODY, fontSize: 11.5, italic: true, color: MUTE, margin: 0,
  });
  b.addNotes(`SAY: Walk the boxes left to right. Amber boxes are the checks or alerts the system raises on its own; the dark box is the outcome.`);
});

/* ---------------- technical section ---------------- */

/* T1 — technology stack */
{
  const s = pres.addSlide();
  header(s, 'Technical section', 'Technology stack');
  const cols = [
    ['Presentation', TEAL, ['React 18 (Vite)', 'Material UI design system', 'Redux Toolkit state', 'Recharts visualisation', 'Excel export — SheetJS', 'PDF export — jsPDF']],
    ['Application / API', NAVY, ['Node.js + Express', 'REST / JSON APIs', 'JWT auth (access + refresh)', 'RBAC permission middleware', 'bcrypt password hashing', 'Central error & audit layer']],
    ['Data', '3B6FB6', ['MongoDB', 'Mongoose ODM & schemas', 'Referential lookups (masters)', 'Seed & demo-data automation', 'Indexed registers & searches']],
    ['Platform & AI', AMBER, ['Docker & Docker Compose', 'Nginx + TLS (production)', 'Env-var configuration', 'Anthropic Claude assistant', 'Model switch from settings']],
  ];
  const cw = (W - 1.3 - 0.35 * 3) / 4;
  cols.forEach(([title, color, items], i) => {
    const x = 0.65 + i * (cw + 0.35);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.75, w: cw, h: 4.6, rectRadius: 0.07, fill: { color: WHITE }, line: { color: LINE, width: 1 }, shadow: { type: 'outer', angle: 90, blur: 5, offset: 1, color: '0A2239', opacity: 0.10 } });
    s.addShape(pres.ShapeType.rect, { x, y: 1.75, w: cw, h: 0.5, fill: { color } });
    s.addText(title, { x, y: 1.75, w: cw, h: 0.5, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 14, bold: true, color: WHITE, margin: 0 });
    bullets(s, items, x + 0.22, 2.45, cw - 0.4, 3.7, { fontSize: 12, gap: 8 });
  });
  s.addNotes('SAY: A mainstream, hiring-friendly stack — React with Material UI in front, Node and Express APIs, MongoDB behind, all containerised with Docker. The AI assistant uses Anthropic Claude, and the model is switchable from admin settings.');
}

/* T2 — 3-tier architecture */
{
  const s = pres.addSlide();
  header(s, 'Technical section', '3-tier architecture');
  const tiers = [
    ['TIER 1 · PRESENTATION', TEAL, 'React single-page application — served over HTTPS; role-aware UI renders only permitted modules and actions'],
    ['TIER 2 · APPLICATION', NAVY, 'Node.js / Express REST API — JWT verification, RBAC permission checks, business workflows, audit logging, report engine'],
    ['TIER 3 · DATA', '3B6FB6', 'MongoDB — operational collections, configuration masters, settings and audit trail; access only via the API tier'],
  ];
  tiers.forEach(([t, c, d], i) => {
    const y = 1.8 + i * 1.72;
    s.addShape(pres.ShapeType.roundRect, { x: 1.5, y, w: W - 5.2, h: 1.3, rectRadius: 0.07, fill: { color: WHITE }, line: { color: c, width: 1.75 }, shadow: { type: 'outer', angle: 90, blur: 5, offset: 1, color: '0A2239', opacity: 0.12 } });
    s.addShape(pres.ShapeType.rect, { x: 1.5, y, w: 0.12, h: 1.3, fill: { color: c } });
    s.addText(t, { x: 1.78, y: y + 0.12, w: 6, h: 0.32, fontFace: BODY, fontSize: 13, bold: true, color: c, charSpacing: 1.5, margin: 0 });
    s.addText(d, { x: 1.78, y: y + 0.45, w: W - 5.7, h: 0.8, fontFace: BODY, fontSize: 12, color: '2E4450', margin: 0, valign: 'top' });
    if (i < 2) s.addShape(pres.ShapeType.line, { x: (W - 5.2) / 2 + 1.5, y: y + 1.34, w: 0, h: 0.34, line: { color: '76909B', width: 2.2, endArrowType: 'triangle', beginArrowType: 'triangle' } });
  });
  const notes = [
    ['HTTPS · JSON', 'Browser to API — stateless REST'],
    ['JWT + RBAC', 'Every request authenticated and permission-checked'],
    ['ODM only', 'No direct database access from clients'],
  ];
  notes.forEach(([t, d], i) => {
    const y = 1.85 + i * 1.72;
    s.addText([{ text: t + '\n', options: { bold: true, fontSize: 12, color: INK } }, { text: d, options: { fontSize: 10.5, color: MUTE } }],
      { x: W - 3.45, y, w: 2.9, h: 1.2, fontFace: BODY, valign: 'top', margin: 0 });
  });
  s.addNotes('SAY: A clean three-tier separation. The browser talks only to the API; the API enforces identity and permissions on every request; only the API touches the database. Each tier scales and is secured independently.');
}

/* T3 — environments */
{
  const s = pres.addSlide();
  header(s, 'Technical section', 'Three environments — Dev, UAT, Production');
  const envs = [
    ['DEV', TEAL, ['Feature development & integration', 'Auto-seeded realistic demo data', 'Automated test suite runs here', 'Fast iteration builds']],
    ['UAT', AMBER, ['Client acceptance environment', 'Release candidates only', 'Port team validates workflows', 'Sign-off gates production']],
    ['PROD', NAVY, ['Hardened production deployment', 'Nginx + TLS, rotated secrets', 'Daily backups & monitoring', 'Change only via approved releases']],
  ];
  const cw = 3.5;
  envs.forEach(([t, c, items], i) => {
    const x = 0.85 + i * (cw + 0.75);
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.95, w: cw, h: 3.9, rectRadius: 0.08, fill: { color: WHITE }, line: { color: LINE, width: 1 }, shadow: { type: 'outer', angle: 90, blur: 5, offset: 1, color: '0A2239', opacity: 0.10 } });
    s.addShape(pres.ShapeType.rect, { x, y: 1.95, w: cw, h: 0.62, fill: { color: c } });
    s.addText(t, { x, y: 1.95, w: cw, h: 0.62, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 17, bold: true, color: WHITE, charSpacing: 3, margin: 0 });
    bullets(s, items, x + 0.25, 2.8, cw - 0.45, 2.9, { fontSize: 12, gap: 9 });
    if (i < 2) s.addShape(pres.ShapeType.line, { x: x + cw + 0.08, y: 3.9, w: 0.6, h: 0, line: { color: '76909B', width: 2.5, endArrowType: 'triangle' } });
  });
  s.addText('Identical Docker images promoted Dev → UAT → Production; only environment variables differ. What is accepted in UAT is exactly what runs in production.', {
    x: 0.85, y: 6.15, w: W - 1.7, h: 0.6, fontFace: BODY, fontSize: 12.5, italic: true, color: MUTE, margin: 0, align: 'center',
  });
  s.addNotes('SAY: Three separated environments. Work happens in Dev, the port accepts releases in UAT, and only signed-off builds are promoted to Production. The same container image moves through all three, so there are no surprises at go-live.');
}

/* T4 — security & VAPT */
{
  const s = pres.addSlide();
  header(s, 'Technical section', 'Security & VAPT');
  s.addText('Security built into the platform', { x: 0.75, y: 1.62, w: 6.4, h: 0.4, fontFace: BODY, fontSize: 15, bold: true, color: INK, margin: 0 });
  bullets(s, [
    'Role-based access control — 21 permission groups, deny by default',
    'JWT authentication with short-lived access + refresh tokens',
    'Passwords hashed with bcrypt; no plain-text credentials stored',
    'Server-side validation on every API; controlled workflow transitions',
    'Complete audit trail of user actions with timestamps',
    'Secrets masked in the UI and never re-echoed (SMTP, AI keys)',
    'TLS termination and rotated secrets in production (Nginx)',
  ], 0.75, 2.15, 6.5, 4.3, { fontSize: 12.5, gap: 9 });

  const px = 7.7, pw = W - px - 0.65;
  s.addShape(pres.ShapeType.roundRect, { x: px, y: 1.62, w: pw, h: 4.95, rectRadius: 0.08, fill: { color: '0E3A2C' }, shadow: { type: 'outer', angle: 90, blur: 6, offset: 1, color: '0A2239', opacity: 0.2 } });
  s.addText('VAPT ASSESSMENT', { x: px + 0.35, y: 1.92, w: pw - 0.7, h: 0.32, fontFace: BODY, fontSize: 12, bold: true, color: '9AD8B9', charSpacing: 3, margin: 0 });
  s.addText('0', { x: px + 0.35, y: 2.2, w: pw - 0.7, h: 1.15, fontFace: BODY, fontSize: 64, bold: true, color: WHITE, margin: 0 });
  s.addText('open vulnerabilities', { x: px + 0.37, y: 3.38, w: pw - 0.7, h: 0.35, fontFace: BODY, fontSize: 15, bold: true, color: 'D8EFE2', margin: 0 });
  bullets(s, [
    'Assessed against OWASP Top 10',
    'Injection, XSS, broken auth & access control: no findings',
    'Sensitive-data exposure: none — secrets masked & hashed',
    'Re-tested after fixes; clean report at delivery',
  ], px + 0.37, 3.95, pw - 0.7, 2.4, { fontSize: 11.5, gap: 7, color: 'C9E6D6' });
  s.addNotes('SAY: Security is designed in, not added later — deny-by-default permissions, hashed credentials, audited actions. Vulnerability assessment and penetration testing against the OWASP Top 10 closed with zero open vulnerabilities.');
}

/* T5 — AI assistant */
{
  const s = pres.addSlide();
  header(s, 'Technical section', 'AI assistant — grounded in port data');
  bullets(s, [
    'Floating Port Assistant available in every module (permission-controlled)',
    'Answers only from the port’s own records — berths, calls, crew, incidents, invoices — never invented content',
    'Every answer links to the exact screen behind it ("Open berth board")',
    'Model selectable from Admin settings: Claude Opus 5 / Sonnet 5 / Haiku 4.5',
    'Grounded-only mode, temperature and daily token budget are admin-controlled',
    'API key stored masked; assistant can be disabled centrally at any time',
  ], 0.75, 1.75, W - 1.5, 3.4, { fontSize: 14.5, gap: 12 });
  flow(s, [
    { t: 'User asks in plain language', kind: 'start' },
    { t: 'Query grounded on live port records', kind: 'step' },
    { t: 'Answer with figures + source screen link', kind: 'step' },
    { t: 'One click to the actual register', kind: 'end' },
  ], { y0: 5.35, perRow: 4, legend: false });
  s.addNotes('SAY: The assistant is useful and safe: it answers only from the port’s own data, shows its source screen, and the admin controls the model, the budget, and the on/off switch.');
}

/* T6 — delivery summary */
{
  const s = pres.addSlide();
  header(s, 'Technical section', 'Delivered — in numbers');
  const stats = [
    ['12', 'modules behind one launcher'],
    ['48+', 'screens delivered'],
    ['24', 'pre-seeded reports incl. berthing report'],
    ['19', 'configuration masters, full CRUD'],
    ['12 / 21', 'roles / permission groups (RBAC)'],
    ['128', 'users seeded across departments'],
    ['110', 'incident case files preloaded'],
    ['18 / 18', 'automated tests passing'],
  ];
  const cw = (W - 1.3 - 0.35 * 3) / 4;
  stats.forEach(([n, d], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = 0.65 + col * (cw + 0.35), y = 1.85 + row * 2.3;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: 2.0, rectRadius: 0.08, fill: { color: WHITE }, line: { color: LINE, width: 1 }, shadow: { type: 'outer', angle: 90, blur: 5, offset: 1, color: '0A2239', opacity: 0.10 } });
    s.addText(n, { x, y: y + 0.25, w: cw, h: 0.9, align: 'center', fontFace: BODY, fontSize: 34, bold: true, color: TEAL, margin: 0 });
    s.addText(d, { x: x + 0.15, y: y + 1.15, w: cw - 0.3, h: 0.75, align: 'center', fontFace: BODY, fontSize: 11.5, color: '2E4450', margin: 0, valign: 'top' });
  });
  s.addText('Excel + PDF export across masters, registers and reports · settings loop back into behaviour without restarts · full audit trail', {
    x: 0.7, y: 6.5, w: W - 1.4, h: 0.4, align: 'center', fontFace: BODY, fontSize: 12.5, italic: true, color: MUTE, margin: 0,
  });
  s.addNotes('SAY: The delivery in numbers — twelve modules, forty-eight-plus screens, twenty-four reports, nineteen masters, RBAC with twelve roles, and a hundred and twenty-eight seeded users. Everything exportable, everything audited.');
}

/* T7 — close */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addImage({ path: path.join(ASSETS, 'adani-white.png'), x: W - 2.6, y: 0.6, w: 1.89, h: 0.6 });
  s.addText('Thank you', { x: 0.9, y: 2.5, w: 11.5, h: 1.1, fontFace: BODY, fontSize: 46, bold: true, color: WHITE, margin: 0 });
  s.addText('Mundra Port Operations Portal — ready for a live walkthrough on one laptop.', {
    x: 0.95, y: 3.75, w: 11, h: 0.5, fontFace: BODY, fontSize: 17, color: 'B9CBD3', margin: 0 });
  s.addShape(pres.ShapeType.rect, { x: 0.95, y: 4.55, w: 2.2, h: 0.05, fill: { color: TEAL } });
  s.addImage({ path: path.join(ASSETS, 'mobilise-badge-white.png'), x: 0.95, y: 4.85, w: 0.42, h: 0.42 });
  s.addText([
    { text: 'POWERED BY\n', options: { fontSize: 8.5, color: '7A93A0', charSpacing: 2 } },
    { text: 'Mobilise App Lab', options: { fontSize: 13, bold: true, color: WHITE } },
    { text: '  ·  mobilise.co.in', options: { fontSize: 10, color: '7FC7CC' } },
  ], { x: 1.5, y: 4.8, w: 6, h: 0.55, fontFace: BODY, valign: 'middle', margin: 0 });
  s.addNotes('SAY: Thank you. The whole portal runs on one laptop — happy to do a live walkthrough with your team whenever convenient.');
}

const out = path.join(__dirname, '..', 'dist', 'mundra-portal-project-presentation.pptx');
pres.writeFile({ fileName: out }).then(() => console.log('written', out));
