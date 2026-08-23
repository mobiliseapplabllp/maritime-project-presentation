// Simple walkthrough deck — dist/mundra-portal-walkthrough.pptx
// One sentence per slide, a big screenshot, and a spoken script in the
// presenter notes. Made to be presented without technical explanation.
const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
pres.author = 'Mobilise App Lab';
pres.title = 'Mundra Port Operations Portal — walkthrough';

const W = 13.333;
const NAVY = '0A2239';
const TEAL = '0E7C86';
const INKTX = '15242E';
const MUTE = '5C7078';
const WHITE = 'FFFFFF';
const PAPER = 'F6F8F8';
const BODY = 'Calibri';

const SHOTS = (f) => path.join(__dirname, '..', 'portal', '.dev', 'shots', f);

// screenshots are 2160x1350 (aspect 1.6)
const IMG_H = 5.9, IMG_W = IMG_H * 1.6, IMG_X = (W - IMG_W) / 2, IMG_Y = 1.38;

function shotSlide(n, caption, img, notes) {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  s.addText(String(n), {
    x: 0.55, y: 0.42, w: 0.62, h: 0.62, align: 'center', valign: 'middle',
    fontFace: BODY, fontSize: 20, bold: true, color: WHITE,
    fill: { color: NAVY }, shape: pres.ShapeType.roundRect, rectRadius: 0.09,
  });
  s.addText(caption, {
    x: 1.38, y: 0.3, w: W - 1.38 - 0.55, h: 0.88, fontFace: BODY, fontSize: 23,
    bold: true, color: INKTX, valign: 'middle', margin: 0,
  });
  s.addShape(pres.ShapeType.rect, { x: 1.4, y: 1.2, w: 2.2, h: 0.045, fill: { color: TEAL } });
  s.addImage({
    path: img, x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H, rounding: true,
    shadow: { type: 'outer', angle: 90, blur: 10, offset: 2, color: '0A2239', opacity: 0.28 },
  });
  s.addNotes(notes);
  return s;
}

function statementSlide(title, lines, notes, darkBg) {
  const s = pres.addSlide();
  s.background = { color: darkBg ? NAVY : WHITE };
  s.addText(title, {
    x: 0.9, y: 0.85, w: W - 1.8, h: 1.0, fontFace: BODY, fontSize: 38, bold: true,
    color: darkBg ? WHITE : INKTX, margin: 0,
  });
  s.addShape(pres.ShapeType.rect, { x: 0.95, y: 1.85, w: 2.2, h: 0.05, fill: { color: TEAL } });
  s.addText(lines.map((t, i) => ({
    text: t,
    options: { fontSize: 22, color: darkBg ? 'D9E4E8' : '2E4450', breakLine: true,
      paraSpaceAfter: i === lines.length - 1 ? 0 : 18, bullet: { code: '2022', indent: 22 } },
  })), { x: 1.0, y: 2.45, w: W - 2.3, h: 4.2, fontFace: BODY, valign: 'top', lineSpacingMultiple: 1.12 });
  s.addNotes(notes);
  return s;
}

/* 1 — title */
const ASSETS = path.join(__dirname, 'assets');
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addShape(pres.ShapeType.rect, { x: 0, y: 5.05, w: W, h: 0.06, fill: { color: TEAL } });
  s.addImage({ path: path.join(ASSETS, 'adani-white.png'), x: W - 2.6, y: 0.6, w: 1.89, h: 0.6 });
  s.addText('Mundra Port\nOperations Portal', {
    x: 0.9, y: 2.05, w: 11.5, h: 2.2, fontFace: BODY, fontSize: 48, bold: true,
    color: WHITE, margin: 0, lineSpacingMultiple: 1.02,
  });
  s.addText('A short walkthrough of working software — every picture is a real screen.', {
    x: 0.95, y: 4.35, w: 10.5, h: 0.5, fontFace: BODY, fontSize: 17, color: 'B9CBD3', margin: 0,
  });
  s.addText('August 2026', {
    x: 0.95, y: 5.35, w: 6, h: 0.4, fontFace: BODY, fontSize: 13, color: '7A93A0', margin: 0,
  });
  s.addImage({ path: path.join(ASSETS, 'mobilise-badge-white.png'), x: 0.95, y: 6.4, w: 0.42, h: 0.42 });
  s.addText([
    { text: 'POWERED BY\n', options: { fontSize: 8.5, color: '7A93A0', charSpacing: 2 } },
    { text: 'Mobilise App Lab', options: { fontSize: 13, bold: true, color: WHITE } },
    { text: '  ·  mobilise.co.in', options: { fontSize: 10, color: '7FC7CC' } },
  ], { x: 1.5, y: 6.35, w: 6, h: 0.55, fontFace: BODY, valign: 'middle', margin: 0 });
  s.addNotes(
    'SAY: Thank you for the time. I will keep this very simple — about ten pictures. ' +
    'Everything you will see is a real, running software we built for port operations, ' +
    'filled with realistic Mundra data. At the end I will show it live if you like.'
  );
}

/* 2 — what is this */
statementSlide(
  'What is this?',
  [
    'One software where the whole port works — every department, one login.',
    'It covers daily harbour operations, vessels, crew, incidents, inspections, port companies, billing and reports.',
    'It is already built and running. This deck is just pictures of it.',
  ],
  'SAY: This is one portal for the whole port. Instead of registers, Excel sheets and phone calls, ' +
  'every department works in the same place. Operations, vessels, crew, incidents, inspections, ' +
  'billing, reports — all inside. And the important part: this is not a concept. It is already ' +
  'built and running — every slide from here is a screenshot of the actual software.'
);

/* 3..12 — screenshots */
shotSlide(1, 'Sign in once — each person sees only the applications their role needs.',
  SHOTS('v6-01-launcher.png'),
  'SAY: This is what you see after signing in. Twelve applications. A berth planner sees berthing, ' +
  'an HSE officer sees incidents, a billing clerk sees finance. One login, and each person gets ' +
  'only what their role allows. Access is controlled by you, from the admin application.');

shotSlide(2, 'The whole port on one screen, the moment you sign in.',
  SHOTS('v6-17-dashboard.png'),
  'SAY: The command centre. Vessels at berth, at anchorage, cargo handled this month, arrivals in ' +
  'the next seventy-two hours, cargo throughput month by month, billed revenue, the berth board — ' +
  'live. A director opens this and knows the state of the port in ten seconds.');

shotSlide(3, 'Every berth and every vessel — who is where, right now.',
  SHOTS('v5-14-quay-twin.png'),
  'SAY: This is the quay in picture form. Every berth along the quay, which vessel is on it, ' +
  'which berths are free, who is arriving next. Marine control sees this instead of maintaining ' +
  'a whiteboard or a register.');

shotSlide(4, 'The daily berthing report you already publish — generated automatically.',
  SHOTS('v6-05-berthing-report.png'),
  'SAY: This one is special. This is the same daily berthing report Mundra publishes today — same ' +
  'format: seven days of tide timings, vessels at berth including vacant berths, drafts forward and ' +
  'aft, vessels sailed in the last forty-eight hours, anchorage, and the expected line-up. Today ' +
  'somebody compiles this by hand. Here it is generated in one click, and exported to Excel or PDF.');

shotSlide(5, 'Twenty-four ready reports — Excel and PDF in one click.',
  SHOTS('v6-04-report-library.png'),
  'SAY: Beyond the berthing report there is a full report library — vessel line-up, berth occupancy, ' +
  'waiting time, certificate expiry, crew reports, incident registers, outstanding payments, revenue. ' +
  'Twenty-four reports ready today, and new ones can be added. Every one exports to Excel and PDF.');

shotSlide(6, 'Incidents become case files — reported, assigned, resolved, closed.',
  SHOTS('v5-02-incident-dashboard.png'),
  'SAY: Safety and marine incidents. Every incident becomes a numbered case file — who reported it, ' +
  'who is handling it, what actions were taken, documents, and root cause. Management sees response ' +
  'times against targets on this dashboard. Nothing gets lost in phone calls.');

shotSlide(7, 'Inspections run on your own checklists — your team writes the questions.',
  SHOTS('v6-09-checklist-builder.png'),
  'SAY: For inspections and audits, your team builds the checklists themselves — safety walkabouts, ' +
  'terminal audits, ship inspections. Add questions, set which ones are critical, and every ' +
  'inspection then follows the checklist. When rules change, you change the checklist — no vendor needed.');

shotSlide(8, 'Crew and certificates tracked — warnings before anything expires.',
  SHOTS('v6-13-crew-dashboard.png'),
  'SAY: Crew documents — medicals, competency certificates, licences. The software watches expiry ' +
  'dates and shows who needs attention first, before a document lapses, not after. Same idea for ' +
  'ship certificates on the vessel side.');

shotSlide(9, 'Ask in plain words — it answers from your port’s own records.',
  SHOTS('v6-18-ai-chat.png'),
  'SAY: And there is an assistant. You ask in plain language — here I asked which berths are ' +
  'occupied right now — and it answers from the port’s own live records, with a button to open ' +
  'the actual screen. It only answers from your data, it does not make things up.');

shotSlide(10, 'Your team controls everything — masters, settings, users.',
  SHOTS('v6-02-data-studio.png'),
  'SAY: Last picture. Everything that drives the software — berths, equipment, departments, units, ' +
  'holidays, document types — is editable by your own team, with Excel and PDF export. Settings too: ' +
  'every application has its own settings page. The port stays in control, not the vendor.');

/* 13 — why it matters */
statementSlide(
  'Why this matters',
  [
    'It is working software, not a proposal — you can click it today.',
    'It is built the way a port actually runs — berths, tides, vessel calls, GST invoices, inspections.',
    'It can be shaped with your team into a pilot for the areas you choose.',
  ],
  'SAY: Three things to take away. First, this exists — you can click through it today, in this ' +
  'meeting. Second, it is built around real port routine — the berthing report, tide tables, vessel ' +
  'call numbers, GST on invoices. Third, this is a starting point: we sit with your team, pick the ' +
  'areas that matter most, and shape a pilot around them.'
);

/* 14 — next step */
{
  const s = pres.addSlide();
  s.background = { color: NAVY };
  s.addImage({ path: path.join(ASSETS, 'adani-white.png'), x: W - 2.6, y: 0.6, w: 1.89, h: 0.6 });
  s.addText('Next step', {
    x: 0.95, y: 1.7, w: 8, h: 0.5, fontFace: BODY, fontSize: 16, bold: true,
    color: '7FC7CC', charSpacing: 3, margin: 0,
  });
  s.addText('A 30-minute live walkthrough.', {
    x: 0.9, y: 2.25, w: 11.6, h: 1.1, fontFace: BODY, fontSize: 40, bold: true, color: WHITE, margin: 0,
  });
  s.addText('It runs on one laptop. You click, we talk — then we agree what a pilot should cover.', {
    x: 0.95, y: 3.5, w: 10.8, h: 0.6, fontFace: BODY, fontSize: 18, color: 'B9CBD3', margin: 0,
  });
  s.addShape(pres.ShapeType.rect, { x: 0.95, y: 4.5, w: 2.2, h: 0.05, fill: { color: TEAL } });
  s.addImage({ path: path.join(ASSETS, 'mobilise-badge-white.png'), x: 0.95, y: 4.8, w: 0.42, h: 0.42 });
  s.addText([
    { text: 'POWERED BY\n', options: { fontSize: 8.5, color: '7A93A0', charSpacing: 2 } },
    { text: 'Mobilise App Lab', options: { fontSize: 13, bold: true, color: WHITE } },
    { text: '  ·  mobilise.co.in', options: { fontSize: 10, color: '7FC7CC' } },
  ], { x: 1.5, y: 4.75, w: 6, h: 0.55, fontFace: BODY, valign: 'middle', margin: 0 });
  s.addNotes(
    'SAY: The next step is simple — thirty minutes with the people who run these areas. The software ' +
    'runs on one laptop, no installation on your side. You click through it yourselves, and at the ' +
    'end we agree together what a pilot should cover. Thank you.'
  );
}

const out = path.join(__dirname, '..', 'dist', 'mundra-portal-walkthrough.pptx');
pres.writeFile({ fileName: out }).then(() => console.log('written', out));
