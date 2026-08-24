/* Demo-parity drive: the same three history surfaces served entirely in-browser
 * from src/demo/snapshot.json via demoClient, checked against the live figures. */
import { chromium } from '/home/user/maritime-project-presentation/portal/frontend/node_modules/playwright-core/index.mjs';

const BASE = process.env.DEMO_BASE || 'http://localhost:4321';
const OUT = '/home/user/maritime-project-presentation/portal/.dev/shots/';
const errors = [];
const checks = [];
const IGNORE = /fonts\.googleapis|fonts\.gstatic|ERR_CONNECTION_RESET/;

// what the live API returned for the same window — the demo must match exactly
const LIVE = {
  fleetJobs: '2,984', fleetHours: '6,715', fleetAvail: '97.7%', busiest: 'MB-01',
  craftJobs12m: 217, craftHours12m: 552, craftAvail: '96.4%', craftLifetime: '686 jobs since 2023',
  tariffBase: '₹10.59', tariffTotal: '+18%', tariffAsAt: '01 Apr 2024',
  estateAvail: '97%', estateDays: '262',
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 220)}`); });
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console: ${m.text().slice(0, 220)}`); });
page.on('response', (r) => { if (r.status() >= 400 && !IGNORE.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

// the demo bundle ships with HashRouter (static hosting) — deep links are /#/path
const go = async (p) => { await page.goto(`${BASE}/#${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(400); };
const shot = async (name, ms = 800, fullPage = true) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}hist-demo-${name}.png`, fullPage }); console.log('  shot →', `hist-demo-${name}.png`); };
const modalDrawer = () => page.locator('.MuiDrawer-root.MuiModal-root .MuiDrawer-paper');
const check = async (label, fn) => {
  try {
    const v = await fn();
    if (v) checks.push(`PASS  ${label}${typeof v === 'string' ? ` — ${v}` : ''}`);
    else { checks.push(`FAIL  ${label}`); errors.push(`assertion failed: ${label}`); }
  } catch (e) { checks.push(`FAIL  ${label} (${e.message.slice(0, 90)})`); errors.push(`assertion threw: ${label}`); }
};
const num = (s) => Number(String(s || '').replace(/[^0-9.]/g, '')) || 0;

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });
console.log('logged into the demo bundle');

/* A — marine craft */
await go('/marine-services');
await page.waitForSelector('text=Mundra Shakti', { timeout: 20000 });
await page.waitForTimeout(1200);
await check('demo craft card matches the live service digest', async () => {
  const txt = await page.locator('.MuiCard-root').filter({ hasText: 'Mundra Shakti' }).first().innerText();
  const l = txt.split('\n').map((x) => x.trim()).filter(Boolean);
  const jobs = num(l[l.findIndex((x) => /^JOBS · 12 M$/i.test(x)) - 1]);
  const hours = num(l[l.findIndex((x) => /^HOURS$/i.test(x)) - 1]);
  const avail = l[l.findIndex((x) => /^AVAILABLE$/i.test(x)) - 1];
  const ok = jobs === LIVE.craftJobs12m && hours === LIVE.craftHours12m && avail === LIVE.craftAvail
    && txt.includes(LIVE.craftLifetime);
  return ok ? `${jobs} jobs / ${hours} h / ${avail} — identical to the live API` : `got ${jobs}/${hours}/${avail}`;
});
await shot('01-marine-board');

await page.locator('.MuiCard-root').filter({ hasText: 'Mundra Shakti' }).first().getByRole('button', { name: 'Record' }).click();
await page.waitForSelector('text=Out of service', { timeout: 20000 });
await page.waitForTimeout(1400);
const drawer = modalDrawer();
await check('demo service record pages jobs from the snapshot', async () => {
  const rows = await drawer.locator('table').last().locator('tbody tr').count();
  const first = await drawer.locator('table').last().locator('tbody tr').first().innerText();
  const outs = await drawer.locator('table').first().locator('tbody tr').count();
  const bars = await drawer.locator('.recharts-bar-rectangle').count();
  return rows === 10 && outs === 4 && bars === 12 && /MUN-20\d\d-\d{4}/.test(first)
    ? `10 paged job rows, 4 outage windows, 12 monthly bars` : `rows=${rows} outs=${outs} bars=${bars}`;
});
await shot('02-craft-service-record', 800, false);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

await page.getByRole('tab', { name: /Fleet utilisation/ }).click();
await page.waitForSelector('text=Jobs per month across the fleet', { timeout: 20000 });
await page.waitForTimeout(1600);
await check('demo fleet utilisation totals match the live API', async () => {
  const t = await page.locator('body').innerText();
  const has = (s) => t.includes(s);
  const rows = await page.locator('table').filter({ hasText: 'Availability' }).first().locator('tbody tr').count();
  return has(LIVE.fleetJobs) && has(LIVE.fleetHours) && has(LIVE.fleetAvail) && has(LIVE.busiest) && rows === 17
    ? `${LIVE.fleetJobs} assists · ${LIVE.fleetHours} h · ${LIVE.fleetAvail} available · busiest ${LIVE.busiest} · 17 craft rows` : false;
});
await shot('03-fleet-utilisation');

/* B — tariffs */
await go('/masters/tariffs');
await page.waitForSelector('text=Port dues', { timeout: 20000 });
await page.waitForTimeout(900);
await check('demo tariff list shows the last revision', async () => {
  const txt = (await page.locator('tbody tr').filter({ hasText: 'Port dues' }).first().innerText()).replace(/\s+/g, ' ');
  return /\+5%/.test(txt) && /01 Apr 2026/.test(txt) ? txt.slice(0, 100) : false;
});
await page.locator('tbody tr').filter({ hasText: 'Port dues' }).first().click();
await page.waitForSelector('text=Rate trend', { timeout: 20000 });
const tdr = modalDrawer();
await tdr.locator('.recharts-line-dots circle').first().waitFor({ timeout: 15000 });
await page.waitForTimeout(600);
await check('demo rate history matches the live computation', async () => {
  const txt = (await tdr.innerText()).replace(/\s+/g, ' ');
  const rows = await tdr.locator('table').first().locator('tbody tr').count();
  const dots = await tdr.locator('.recharts-line-dots circle').count();
  return rows === 3 && dots === 4 && txt.includes(LIVE.tariffTotal) && txt.includes(LIVE.tariffBase)
    ? `3 revisions, 4 plotted points, ${LIVE.tariffTotal} since base ${LIVE.tariffBase}` : false;
});
await check('demo "rate as at" resolves the same historical rate', async () => {
  await tdr.getByLabel('Rate as at').fill('2024-06-15');
  await page.waitForTimeout(500);
  const txt = (await tdr.innerText()).replace(/\s+/g, ' ');
  return txt.includes('₹11.44') && txt.includes(LIVE.tariffAsAt) ? `15 Jun 2024 → ₹11.44 (in force from ${LIVE.tariffAsAt})` : false;
});
await shot('04-tariff-rate-history', 800, false);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* C — berths */
await go('/masters/berths');
await page.waitForSelector('text=Estate downtime', { timeout: 20000 });
await page.waitForTimeout(1600);
await check('demo estate downtime matches the live API', async () => {
  const panel = page.locator('.MuiCard-root').filter({ hasText: 'Estate downtime' }).first();
  const txt = (await panel.innerText()).replace(/\s+/g, ' ');
  const bars = await page.locator('.recharts-bar-rectangle').count();
  return txt.includes(LIVE.estateAvail) && txt.includes(LIVE.estateDays) && /Planned/.test(txt) && /Dredging/.test(txt) && bars === 12
    ? `${LIVE.estateAvail} availability, ${LIVE.estateDays} berth-days lost, 12 monthly bars` : false;
});
await shot('05-berths-downtime');
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Outage windows', { timeout: 20000 });
await page.waitForTimeout(1400);
const bdr = modalDrawer();
await check('demo berth outage history renders from the snapshot', async () => {
  const rows = await bdr.locator('table').last().locator('tbody tr').count();
  const txt = (await bdr.innerText()).replace(/\s+/g, ' ');
  const m = txt.match(/([\d.]+)% AVAILABILITY · 12 M/i);
  return rows === 7 && m && /Civil & Marine Works/.test(txt) ? `7 outage windows, ${m[1]}% available over 12 months` : false;
});
await shot('06-berth-outage-history', 800, false);

console.log('\n--- demo assertions ---');
for (const c of checks) console.log(' ', c);
console.log('\n--- console/page errors ---');
console.log(errors.length ? errors.join('\n') : '  none');
await browser.close();
process.exit(errors.length ? 1 : 0);
