import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'http://localhost:5300';
const OUT = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

const shot = async (name, ms = 600) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot', name); };

// 1 login page
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await shot('01-login');

// login as admin
await page.fill('input[type="password"]', 'Mundra@2026');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('text=Cargo throughput', { timeout: 20000 });
await shot('02-dashboard-light', 1600);

// dark mode
await page.click('[aria-label="Dark mode"], button:has(svg[data-testid="DarkModeRoundedIcon"])');
await shot('03-dashboard-dark', 1200);
await page.click('button:has(svg[data-testid="LightModeRoundedIcon"])'); // back to light

// port calls
await page.goto(`${BASE}/port-calls`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('04-portcalls');

// open a berthed call
const berthedRow = page.locator('tr:has-text("Berthed")').first();
await berthedRow.click();
await page.waitForSelector('text=Timeline');
await shot('05-portcall-detail', 900);
await page.click('button[role="tab"]:has-text("Cargo")');
await shot('06-portcall-cargo', 500);

// berth board
await page.goto(`${BASE}/berth-board`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Container Terminal 1');
await shot('07-berth-board');

// vessels + detail
await page.goto(`${BASE}/vessels`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('08-vessels');
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Certificates');
await shot('09-vessel-detail', 800);

// certificates register (expired filter)
await page.goto(`${BASE}/certificates`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await page.click('div.MuiChip-root:has-text("Expired")');
await shot('10-certificates', 800);

// inspections + in-progress detail
await page.goto(`${BASE}/inspections`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('11-inspections');
await page.locator('tr:has-text("In progress")').first().click();
await page.waitForSelector('text=Checklist');
await shot('12-inspection-detail', 900);

// invoices + detail
await page.goto(`${BASE}/invoices`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('13-invoices');
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Total payable');
await shot('14-invoice-detail', 800);

// roles matrix
await page.goto(`${BASE}/admin/roles`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Harbour Master');
await page.click('text=Harbour Master');
await shot('15-roles-matrix', 700);

// audit log
await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('16-audit');

// masters — lookups
await page.goto(`${BASE}/masters/lookups`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=records');
await shot('17-lookups');

// create-call dialog open (visual only)
await page.goto(`${BASE}/port-calls`, { waitUntil: 'networkidle' });
await page.click('button:has-text("Announce call")');
await page.waitForSelector('text=Announce port call');
await shot('18-announce-dialog', 700);
await page.keyboard.press('Escape');

// sign out -> agent login (limited nav proof)
await page.click('header .MuiAvatar-root');
await page.click('li:has-text("Sign out")');
await page.waitForSelector('text=Sample accounts');
await page.click('div.MuiChip-root:has-text("Shipping Agent")');
await page.fill('input[type="password"]', 'Mundra@2026');
await page.click('button:has-text("Sign in")');
await page.waitForSelector('text=Port operations', { timeout: 20000 });
await shot('19-agent-view', 1400);

console.log('ERRORS:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
