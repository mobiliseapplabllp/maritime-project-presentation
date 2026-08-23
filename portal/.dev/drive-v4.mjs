import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5200';
const OUT = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

const shot = async (name, ms = 700) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot', name); };

// one-click role sign-in
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });
await shot('v4-01-header-clean', 1600);

// module launcher (waffle) — includes MIS Reports tile
await page.click('button[aria-label="All applications"], [title="All applications"] button, header button:has(svg[data-testid="AppsRoundedIcon"])');
await page.waitForSelector('text=MIS Reports', { timeout: 10000 });
await shot('v4-02-launcher', 600);
await page.keyboard.press('Escape');

// port calls with stat cards
await page.goto(`${BASE}/port-calls`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=At berth', { timeout: 15000 });
await shot('v4-03-portcalls-stats', 900);

// berth board — table view + CRUD
await page.goto(`${BASE}/berth-board`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=MICT', { timeout: 15000 });
await page.click('button[value="table"]');
await shot('v4-04-berthboard-table', 900);
await page.click('button:has-text("Add berth")');
await page.waitForSelector('text=Create berth');
await shot('v4-05-berth-add-drawer', 700);
await page.keyboard.press('Escape');

// legislation — uniform 75vw reading drawer
await page.goto(`${BASE}/legislation`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records', { timeout: 15000 });
await page.locator('tbody tr').first().click();
await page.waitForTimeout(500);
await shot('v4-06-legislation-drawer', 600);
await page.keyboard.press('Escape');

// MIS report — three tabs
await page.goto(`${BASE}/mis`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Cargo handled', { timeout: 20000 });
await shot('v4-07-mis-cargo', 1200);
await page.click('button[role="tab"]:has-text("Revenue")');
await shot('v4-08-mis-revenue', 900);
await page.click('button[role="tab"]:has-text("Compliance")');
await shot('v4-09-mis-compliance', 900);

// vessels stat strip
await page.goto(`${BASE}/vessels`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Active vessels', { timeout: 15000 });
await shot('v4-10-vessels-stats', 800);

console.log('ERRORS:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
