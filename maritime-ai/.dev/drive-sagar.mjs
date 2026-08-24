// Sagar Drishti — full Playwright drive against backend :8010 + frontend :5273
import { chromium } from '../../portal/frontend/node_modules/playwright-core/index.mjs';

const BASE = 'http://localhost:5273';
const OUT = new URL('./shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !t.includes('ERR_CONNECTION_RESET') && !t.includes('favicon')) {
    errors.push(`console: ${t.slice(0, 200)}`);
  }
});

const shot = async (name, ms = 1000) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('shot', name); };
const go = async (p, ms = 1400) => { await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(ms); };

// login
await go('/', 1200);
await shot('01-login', 300);
// the sign-in card defaults to the email-code (OTP) tab — switch to password
const pwTab = page.locator('button:has-text("Password")').first();
if (await pwTab.count()) { await pwTab.click(); await page.waitForTimeout(600); }
const quick = page.locator('text=harbour.master').first();
if (await quick.count()) { await quick.click(); await page.waitForTimeout(400); }
const userInput = page.locator('input[name="username"], input[type="text"]:not([placeholder*="@"])').first();
if (await userInput.count() && !(await userInput.inputValue())) await userInput.fill('harbour.master');
const pwInput = page.locator('input[type="password"]').first();
if (!(await pwInput.inputValue())) await pwInput.fill('Mundra@2026');
await page.locator('button[type="submit"], button:has-text("Sign in")').last().click();
await page.waitForTimeout(2500);
if (!(await page.locator('text=Sagar').first().count())) errors.push('post-login shell does not show Sagar branding');
await shot('02-dashboard', 2000);

// Port Explorer + its 3D terminal twin tab
await go('/districts'); await shot('04-port-explorer');
const twinTab = page.locator('text=Terminal Twin').first();
if (await twinTab.count()) { await twinTab.click(); await shot('03-terminal-twin-3d', 6000); }
else errors.push('Terminal Twin tab not found on Port Explorer');
await go('/sec/assets'); await shot('05-fleet-section', 1800);
await go('/sec/complaints'); await shot('06-incidents-section', 1800);
await go('/sec/calibration'); await shot('07-certificates', 1800);
await go('/hotspots'); await shot('08-terminal-hotspots', 1800);
await go('/validation'); await shot('09-benchmark', 1800);
await go('/agents'); await shot('10-agents', 1800);

// assistant with an offline intent
await go('/assistant', 1500);
const inp = page.locator('textarea, input[placeholder*="sk" i], input[type="text"]').last();
await inp.fill('longest waiting terminals');
await inp.press('Enter');
await page.waitForTimeout(4000);
await shot('11-assistant', 500);

await go('/year'); await shot('12-yearbook', 2000);

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
