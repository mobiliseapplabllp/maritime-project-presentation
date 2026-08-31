import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5200';
const OUT = new URL('../.dev/shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 220)}`); });

const go = (p) => page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
const shot = async (name, ms = 900) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}v9-${name}.png` }); console.log('shot', name); };

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });

// 01 legislation — new 2023/2024 circulars, incl. Cyclone Biparjoy notice
await go('/legislation');
await page.waitForSelector('text=Notices & Circulars', { timeout: 20000 });
await page.waitForTimeout(1000);
const hasBiparjoy = await page.locator('text=Biparjoy').count();
if (!hasBiparjoy) errors.push('Cyclone Biparjoy 2023 notice not visible on legislation page');
const hasVgm = await page.locator('text=VGM').count();
if (!hasVgm) errors.push('2024 VGM circular not visible on legislation page');
await shot('01-legislation', 500);

// 02 MIS report — full 2023-now range must render without truncation
await go('/mis');
await page.waitForSelector('text=MIS report', { timeout: 20000 });
await page.waitForTimeout(800);
await page.getByLabel('From').fill('2023-01-01');
await page.getByLabel('To').fill('2026-08-24');
await page.click('button:has-text("Run report")');
await page.waitForTimeout(1800);
const misErr = await page.locator('text=/error/i').count();
await shot('02-mis-full-range', 800);

// 03 inspections dashboard — rescoped KPIs
await go('/inspections/overview');
await page.waitForSelector('text=Survey', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
await shot('03-inspections-dashboard', 500);

// 04 seafarer detail — multi-year sea-service history
await go('/seafarers');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=CDC', { timeout: 15000 });
const seaServiceTab = page.locator('button[role="tab"]:has-text("Sea")').or(page.locator('text=Sea service')).first();
if (await seaServiceTab.count()) { await seaServiceTab.click(); await page.waitForTimeout(600); }
await shot('04-seafarer-history', 500);
const has2023 = await page.locator('text=/202[2-3]/').count();
if (!has2023) errors.push('No 2022/2023-dated sea-service entries visible on seafarer detail');

// 05 facilities/licenses — widened applied-date spread
await go('/facilities');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Audit history', { timeout: 15000 });
await shot('05-facility-detail', 500);

// 06 port calls list — extended history count
await go('/port-calls');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.waitForTimeout(800);
await shot('06-portcalls-list', 500);

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
