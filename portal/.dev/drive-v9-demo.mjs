import { chromium } from 'playwright-core';

const BASE = 'http://localhost:4318';
const OUT = new URL('../.dev/shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION_RESET')) errors.push(`console: ${m.text().slice(0, 220)}`); });

const go = (p) => page.goto(`${BASE}/#${p}`, { waitUntil: 'domcontentloaded' });
const shot = async (name, ms = 900) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}v9-demo-${name}.png` }); console.log('shot', name); };

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });
await shot('01-dashboard', 1200);

await go('/port-calls');
await page.waitForSelector('tbody tr', { timeout: 20000 });
await page.waitForSelector('text=/1\\d{3} records/', { timeout: 15000 }).catch(() => errors.push('port-call count never reached 1000+ in demo'));
const recText = await page.locator('text=/\\d+ records/').first().textContent().catch(() => '');
console.log('port-calls records label:', recText);
await shot('02-portcalls', 500);

await go('/legislation');
await page.waitForSelector('tbody tr', { timeout: 20000 });
await page.waitForSelector('text=Biparjoy', { timeout: 15000 }).catch(() => errors.push('Biparjoy notice missing in demo legislation'));
await shot('03-legislation', 400);

await go('/mis');
await page.waitForSelector('text=MIS report', { timeout: 20000 });
await page.waitForTimeout(600);
await page.getByLabel('From').fill('2023-01-01');
await page.click('button:has-text("Run report")');
await page.waitForTimeout(1800);
await shot('04-mis-full-range', 600);

await go('/incidents/overview');
await page.waitForTimeout(1600);
await shot('05-incidents-overview', 600);

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
