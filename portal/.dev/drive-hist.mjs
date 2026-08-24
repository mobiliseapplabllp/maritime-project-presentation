/* Drives the three history surfaces against the live backend on :5200. */
import { chromium } from '/home/user/maritime-project-presentation/portal/frontend/node_modules/playwright-core/index.mjs';

const BASE = 'http://localhost:5200';
const OUT = '/home/user/maritime-project-presentation/portal/.dev/shots/';
const errors = [];
const checks = [];
const IGNORE = /fonts\.googleapis|fonts\.gstatic|ERR_CONNECTION_RESET/;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 220)}`); });
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console: ${m.text().slice(0, 220)}`); });

const go = (p) => page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
// full-page capture of a page with an open modal drawer stitches badly — viewport shots for those
const shot = async (name, ms = 800, fullPage = true) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}hist-${name}.png`, fullPage }); console.log('  shot →', `hist-${name}.png`); };
const modalDrawer = () => page.locator('.MuiDrawer-root.MuiModal-root .MuiDrawer-paper');
const check = async (label, fn) => {
  try {
    const v = await fn();
    if (v) { checks.push(`PASS  ${label}${typeof v === 'string' ? ` — ${v}` : ''}`); } else { checks.push(`FAIL  ${label}`); errors.push(`assertion failed: ${label}`); }
  } catch (e) { checks.push(`FAIL  ${label} (${e.message.slice(0, 90)})`); errors.push(`assertion threw: ${label}`); }
};
const num = (s) => Number(String(s || '').replace(/[^0-9.]/g, '')) || 0;

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });
console.log('logged in');

/* ---------------- A. Marine craft & pilots ---------------- */
console.log('\nA — /marine-services');
await go('/marine-services');
await page.waitForSelector('text=Marine craft & pilots', { timeout: 20000 });
await page.waitForSelector('text=Mundra Shakti', { timeout: 20000 });
await page.waitForTimeout(900);

await check('craft card shows a non-zero 12-month job count', async () => {
  const card = page.locator('.MuiCard-root').filter({ hasText: 'Mundra Shakti' }).first();
  const txt = await card.innerText();
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => /^JOBS · 12 M$/i.test(l));
  const jobs = i > 0 ? num(lines[i - 1]) : 0;
  const hi = lines.findIndex((l) => /^HOURS$/i.test(l));
  const hours = hi > 0 ? num(lines[hi - 1]) : 0;
  return jobs > 0 && hours > 0 ? `TUG-01 card shows ${jobs} jobs / ${hours} assist hours in 12 months` : false;
});
await check('craft card shows lifetime jobs + availability', async () => {
  const card = page.locator('.MuiCard-root').filter({ hasText: 'Mundra Shakti' }).first();
  const txt = await card.innerText();
  return /jobs since 2023/i.test(txt) && /AVAILABLE\b/i.test(txt) ? txt.split('\n').filter((l) => /since 2023/.test(l))[0] : false;
});
await shot('01-marine-board');

// per-craft service record drawer
await page.locator('.MuiCard-root').filter({ hasText: 'Mundra Shakti' }).first().getByRole('button', { name: 'Record' }).click();
await page.waitForSelector('text=Out of service', { timeout: 20000 });
await page.waitForTimeout(1200);
const drawer = modalDrawer();
await check('drawer lists real jobs with VCN / vessel / berth', async () => {
  const rows = await drawer.locator('table').last().locator('tbody tr').count();
  const first = await drawer.locator('table').last().locator('tbody tr').first().innerText();
  return rows >= 10 && /MUN-20\d\d-\d{4}/.test(first) ? `${rows} job rows, first "${first.replace(/\s+/g, ' ').slice(0, 80)}"` : false;
});
await check('drawer lists out-of-service windows', async () => {
  const t = drawer.locator('table').first();
  const rows = await t.locator('tbody tr').count();
  const txt = await t.innerText();
  return rows >= 1 && /overhaul|survey|docking|recertification|renewal|cleaning/i.test(txt) ? `${rows} outage windows` : false;
});
await check('drawer utilisation KPIs are populated', async () => {
  const txt = await drawer.innerText();
  const avail = txt.match(/(\d{1,3}(?:\.\d)?)%/);
  return /Jobs · 12 months/i.test(txt) && /Assist hours/i.test(txt) && avail && Number(avail[1]) > 50
    ? `availability ${avail[1]}%` : false;
});
await check('drawer monthly utilisation chart drew bars', async () => {
  const bars = await drawer.locator('.recharts-bar-rectangle').count();
  return bars >= 6 ? `${bars} monthly bars` : false;
});
await shot('02-craft-service-record', 800, false);

// paging + kind filter inside the drawer
await drawer.getByLabel('Job type').click();
await page.locator('li[role="option"]').nth(1).click();
await page.waitForTimeout(1200);
await check('job-type filter re-queries the server', async () => {
  const rows = await drawer.locator('table').last().locator('tbody tr').count();
  const kinds = await drawer.locator('table').last().locator('tbody tr td:nth-child(5)').allInnerTexts();
  return rows > 0 && new Set(kinds).size === 1 ? `${rows} rows all "${kinds[0]}"` : false;
});
await shot('03-craft-jobs-filtered', 800, false);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// fleet utilisation tab
await page.getByRole('tab', { name: /Fleet utilisation/ }).click();
await page.waitForSelector('text=Jobs per month across the fleet', { timeout: 20000 });
await page.waitForTimeout(1400);
await check('fleet KPIs show real totals', async () => {
  const t = await page.locator('main, body').first().innerText();
  const m = t.match(/([\d,]+)\s*\nASSISTS · 12 MONTHS/i);
  return m && num(m[1]) > 1000 ? `${m[1]} assists in 12 months` : false;
});
await check('busiest-craft table lists the whole fleet', async () => {
  const rows = await page.locator('table').filter({ hasText: 'Availability' }).first().locator('tbody tr').count();
  return rows >= 15 ? `${rows} craft rows` : false;
});
await check('fleet monthly trend chart drew 12 bars', async () => {
  const bars = await page.locator('.recharts-bar-rectangle').count();
  return bars >= 12 ? `${bars} bars across the charts` : false;
});
await shot('04-fleet-utilisation');

/* ---------------- B. Tariffs ---------------- */
console.log('\nB — /masters/tariffs');
await go('/masters/tariffs');
await page.waitForSelector('text=Tariff master', { timeout: 20000 });
await page.waitForSelector('text=Port dues', { timeout: 20000 });
await page.waitForTimeout(900);
await check('tariff rows carry a "Last revised" reading', async () => {
  const row = page.locator('tbody tr').filter({ hasText: 'Port dues' }).first();
  const txt = (await row.innerText()).replace(/\s+/g, ' ');
  return /\+\d+%/.test(txt) && /20\d\d/.test(txt) ? txt.slice(0, 110) : false;
});
await shot('05-tariffs-list');

await page.locator('tbody tr').filter({ hasText: 'Port dues' }).first().click();
await page.waitForSelector('text=Rate trend', { timeout: 20000 });
const tdr = modalDrawer();
await tdr.locator('.recharts-line-dots circle').first().waitFor({ timeout: 15000 });  // recharts draws dots after the line animation
await page.waitForTimeout(600);
await check('rate-history drawer shows the revision trail', async () => {
  const rows = await tdr.locator('table').first().locator('tbody tr').count();
  const txt = await tdr.locator('table').first().innerText();
  return rows >= 3 && /CIRC-TAR/.test(txt) ? `${rows} revisions, circulars referenced` : false;
});
await check('rate trend chart drew a step line', async () => {
  const dots = await tdr.locator('.recharts-line-dots circle').count();
  const path = await tdr.locator('.recharts-line-curve').count();
  return path >= 1 && dots >= 4 ? `${dots} rate points on a step line` : false;
});
await check('"rate as at" reading resolves a historical rate', async () => {
  await tdr.getByLabel('Rate as at').fill('2024-06-15');
  await page.waitForTimeout(500);
  const txt = (await tdr.innerText()).replace(/\s+/g, ' ');
  const m = txt.match(/in force from (\d{2} \w{3} \d{4}) · (CIRC-TAR-[\d/]+)/);
  return m ? `as at 15 Jun 2024 → in force from ${m[1]} (${m[2]})` : false;
});
await check('KPI row shows change since base + CAGR', async () => {
  const txt = (await tdr.innerText()).replace(/\s+/g, ' ');
  return /SINCE BASE RATE/i.test(txt) && /COMPOUND ANNUAL/i.test(txt) ? txt.match(/\+?[\d.]+% SINCE BASE RATE[^A-Z]*/i)[0].trim() : false;
});
await shot('06-tariff-rate-history', 800, false);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* ---------------- C. Berths ---------------- */
console.log('\nC — /masters/berths');
await go('/masters/berths');
await page.waitForSelector('text=Berths & terminals', { timeout: 20000 });
await page.waitForSelector('text=Estate downtime', { timeout: 20000 });
await page.waitForTimeout(1400);
await check('estate downtime panel shows availability + days lost', async () => {
  const panel = page.locator('.MuiCard-root').filter({ hasText: 'Estate downtime' }).first();
  const txt = (await panel.innerText()).replace(/\s+/g, ' ');
  const av = txt.match(/([\d.]+)% AVAILABILITY/i);
  const days = txt.match(/([\d,]+) DAYS LOST/i);
  return av && days && num(days[1]) > 0 ? `${av[1]}% availability, ${days[1]} berth-days lost` : false;
});
await check('estate panel breaks downtime down by cause', async () => {
  const panel = page.locator('.MuiCard-root').filter({ hasText: 'Estate downtime' }).first();
  const txt = await panel.innerText();
  return /Planned/.test(txt) && /Breakdown/.test(txt) && /Dredging/.test(txt) && /Weather/.test(txt) ? 'all four causes charted' : false;
});
await check('estate monthly downtime chart drew bars', async () => {
  const bars = await page.locator('.recharts-bar-rectangle').count();
  return bars >= 6 ? `${bars} monthly bars` : false;
});
await check('berth rows carry a "Last outage" reading', async () => {
  const rows = await page.locator('tbody tr').filter({ hasText: /planned|breakdown|dredging|weather/i }).count();
  return rows >= 5 ? `${rows} of the visible berths show their last outage` : false;
});
await shot('07-berths-downtime');

await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Outage windows', { timeout: 20000 });
await page.waitForTimeout(1200);
const bdr = modalDrawer();
await check('berth drawer lists real outage windows', async () => {
  const t = bdr.locator('table').last();
  const rows = await t.locator('tbody tr').count();
  const txt = (await t.innerText()).replace(/\s+/g, ' ');
  return rows >= 5 && /Civil & Marine Works/.test(txt) ? `${rows} outage windows with reason + contractor` : false;
});
await check('berth drawer shows 12-month availability %', async () => {
  const txt = (await bdr.innerText()).replace(/\s+/g, ' ');
  const m = txt.match(/([\d.]+)% AVAILABILITY · 12 M/i);
  return m && Number(m[1]) > 50 && Number(m[1]) <= 100 ? `${m[1]}% available over 12 months` : false;
});
await check('berth drawer monthly downtime chart drew bars', async () => {
  const bars = await bdr.locator('.recharts-bar-rectangle').count();
  return bars >= 6 ? `${bars} monthly bars` : false;
});
await shot('08-berth-outage-history', 800, false);

console.log('\n--- assertions ---');
for (const c of checks) console.log(' ', c);
console.log('\n--- console/page errors ---');
console.log(errors.length ? errors.join('\n') : '  none');
await browser.close();
process.exit(errors.length ? 1 : 0);
