import { chromium } from 'playwright-core';

const BASE = process.env.DRIVE_BASE || 'http://localhost:5200';
const PFX = process.env.DRIVE_PFX || 'v5';
const HASH = process.env.DRIVE_HASH === '1' ? '/#' : '';
const OUT = new URL('../.dev/shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 180)}`));

const go = (p) => page.goto(`${BASE}${HASH}${p}`, { waitUntil: 'domcontentloaded' });
const shot = async (name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}${PFX}-${name}.png` }); console.log('shot', name); };

// sign in
await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });

// 1 renamed launcher
await page.click('header button:has(svg[data-testid="AppsRoundedIcon"])');
await page.waitForSelector('text=Incident Desk', { timeout: 10000 });
await page.waitForSelector('text=Fleet Manager');
await shot('01-launcher', 500);
await page.keyboard.press('Escape');

// 2 incident dashboard
await go('/incidents/overview');
await page.waitForSelector('text=Mean time to resolve', { timeout: 20000 });
await shot('02-incident-dashboard', 1300);

// 3 register + case file
await go('/incidents');
await page.waitForSelector('text=records', { timeout: 20000 });
await shot('03-incident-register', 900);
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Communications', { timeout: 15000 });
await shot('04-incident-case-comms', 900);
await page.click('button[role="tab"]:has-text("Tasks")');
await shot('05-incident-case-tasks', 600);
await page.click('button[role="tab"]:has-text("Documents")');
await shot('06-incident-case-docs', 600);
await page.click('button[role="tab"]:has-text("Timeline")');
await shot('07-incident-case-timeline', 600);
await page.click('button[role="tab"]:has-text("RCA")');
await shot('08-incident-case-rca', 600);

// 4 fleet dashboard
await go('/fleet');
await page.waitForSelector('text=Registered fleet', { timeout: 20000 });
await shot('09-fleet-dashboard', 1200);

// 5 vessel detail tabs
await go('/vessels');
await page.waitForSelector('text=records', { timeout: 15000 });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Voyages & routes', { timeout: 15000 });
await shot('10-vessel-overview', 900);
await page.click('button[role="tab"]:has-text("Voyages")');
await page.waitForSelector('text=FREQUENT TRADE LANES', { timeout: 15000 });
await shot('11-vessel-voyages', 800);
await page.click('button[role="tab"]:has-text("Risk profile")');
await shot('12-vessel-risk', 1000);

// 6 hover card on port calls
await go('/port-calls');
await page.waitForSelector('text=records', { timeout: 15000 });
await page.locator('tbody tr td b').first().hover();
await page.waitForSelector('text=Open record', { timeout: 8000 });
await shot('13-hover-card', 500);

// 7 quay twin
await go('/quay-view');
await page.waitForSelector('text=ANCHORAGE A1', { timeout: 20000 });
await shot('14-quay-twin', 1100);

// 8 schedule
await go('/schedule');
await page.waitForSelector('text=movement', { timeout: 20000 });
await shot('15-schedule', 900);

// 9 marine services
await go('/marine-services');
await page.waitForSelector('text=Pilot roster', { timeout: 20000 });
await shot('16-marine-services', 900);

// 10 AI floating chat works
await go('/');
await page.waitForSelector('text=Cargo throughput', { timeout: 20000 });
await page.click('button[aria-label="AI assistant"]');
await page.waitForSelector('input[placeholder="Ask the port assistant…"]', { timeout: 10000 });
await page.fill('input[placeholder="Ask the port assistant…"]', 'How many berths are occupied right now?');
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);
const dockText = await page.locator('.MuiDrawer-root').last().innerText();
const chatOk = /berth/i.test(dockText) && /occupied|alongside|free/i.test(dockText);
console.log('CHAT reply ok:', chatOk);
await shot('17-ai-chat', 400);

console.log('ERRORS:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
if (!chatOk) process.exit(2);
