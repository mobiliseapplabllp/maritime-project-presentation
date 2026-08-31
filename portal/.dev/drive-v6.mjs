import { chromium } from 'playwright-core';

const BASE = process.env.DRIVE_BASE || 'http://localhost:5100';
const PFX = process.env.DRIVE_PFX || 'v6';
const OUT = new URL('../.dev/shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

const go = (p) => page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
const shot = async (name, ms = 900) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}${PFX}-${name}.png` }); console.log('shot', name); };

// sign in
await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });

// 01 launcher — 12 modules incl. renames, no Ocean Watch
await page.click('header button:has(svg[data-testid="AppsRoundedIcon"])');
await page.waitForSelector('text=Notices & Circulars', { timeout: 10000 });
await page.waitForSelector('text=Port Companies');
await page.waitForSelector('text=Data Studio');
const hasOcean = await page.locator('text=Ocean Watch').count();
if (hasOcean) errors.push('Ocean Watch still present in launcher');
await shot('01-launcher', 500);
await page.keyboard.press('Escape');

// 02 Data Studio hub (masters)
await go('/masters');
await page.waitForSelector('text=Units of Measure', { timeout: 20000 });
await page.waitForSelector('text=Equipment & Assets');
await shot('02-data-studio', 1100);

// 03 a master page with meta columns + export menu
await go('/masters/m/equipment');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.click('button:has-text("Export")');
await page.waitForSelector('text=Excel (.xlsx)', { timeout: 8000 });
await shot('03-master-equipment-export', 600);
await page.keyboard.press('Escape');

// 04 report library
await go('/reports');
await page.waitForSelector('text=Daily Berthing Report', { timeout: 20000 });
await page.waitForSelector('text=Sea Service Summary');
await shot('04-report-library', 1000);

// 05 berthing report viewer (tide + vacant rows)
await go('/reports/view/berthing');
await page.waitForSelector('text=Tidal predictions', { timeout: 25000 });
await page.waitForSelector('text=Vessels at berth');
await shot('05-berthing-report', 1400);

// 06/07 global settings — SMTP + AI tabs
await go('/admin/settings');
await page.waitForSelector('text=Platform settings', { timeout: 20000 });
await page.click('button[role="tab"]:has-text("SMTP")');
await page.waitForSelector('text=Test connection', { timeout: 8000 }).catch(() => {});
await shot('06-settings-smtp', 700);
await page.click('button[role="tab"]:has-text("AI assistant")');
await shot('07-settings-ai', 700);

// 08 module settings (harbour ops)
await go('/settings/module/ops');
await page.waitForSelector('text=VCN prefix', { timeout: 20000 });
await shot('08-module-settings-ops', 800);

// 09 checklist builder
await go('/checklist-builder');
await page.waitForSelector('text=Checklist builder', { timeout: 20000 });
await page.waitForTimeout(1200);
await shot('09-checklist-builder', 700);

// 10 audit dashboard
await go('/inspections/overview');
await page.waitForSelector('text=Checklist compliance', { timeout: 20000 });
await shot('10-audit-dashboard', 1300);

// 11 companies + detail
await go('/companies');
await page.waitForSelector('text=records', { timeout: 20000 });
await shot('11-companies', 900);
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Licences held', { timeout: 15000 });
await shot('12-company-detail', 900);

// 13 crew dashboard
await go('/seafarers/overview');
await page.waitForSelector('text=Rank distribution', { timeout: 20000 });
await shot('13-crew-dashboard', 1300);

// 14 live traffic now inside Harbour Operations nav
await go('/nmc/map');
await page.waitForSelector('text=Live traffic', { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(1800);
const nav = await page.locator('nav, .MuiDrawer-root').first().innerText().catch(() => '');
if (!/live traffic/i.test(nav)) errors.push('Live Traffic not visible in side nav at /nmc/map');
if (!/schedule|berth board|port calls/i.test(nav)) errors.push('/nmc/map side nav does not look like Harbour Operations');
await shot('14-live-traffic-harbour-ops', 500);

// 15 notices & circulars rename
await go('/legislation');
await page.waitForSelector('text=records', { timeout: 20000 });
const head = await page.locator('main').innerText().catch(() => '');
if (/legislation/i.test(head)) errors.push('Legislation wording still on instruments page');
await shot('15-notices-circulars', 800);

// 16 report viewer: crew certificate expiry (new crew report)
await go('/reports/view/crew-cert-expiry');
await page.waitForSelector('text=Expiring / expired crew documents', { timeout: 20000 });
await shot('16-crew-cert-expiry-report', 900);

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
