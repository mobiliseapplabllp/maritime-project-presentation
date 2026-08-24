import { chromium } from 'playwright-core';

const BASE = 'http://localhost:5100';
const OUT = new URL('../.dev/shots/', import.meta.url).pathname;
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 220)}`); });

const go = (p) => page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
const shot = async (name, ms = 900) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${OUT}v8-${name}.png` }); console.log('shot', name); };

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 30000 });

// 01 global search / command palette
await page.click('button:has-text("Search everything")');
await page.waitForSelector('input[placeholder*="Search vessels"]', { timeout: 8000 });
await page.fill('input[placeholder*="Search vessels"]', 'msc');
await page.waitForTimeout(900);
await shot('01-command-palette', 400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Control+k');
await page.waitForTimeout(500);
const ctrlKWorked = await page.locator('input[placeholder*="Search vessels"]').count();
if (!ctrlKWorked) errors.push('Ctrl+K keyboard shortcut did not open the command palette');
else console.log('Ctrl+K shortcut confirmed working');
await page.keyboard.press('Escape');

// 02 berth window planner
await go('/berth-planner');
await page.waitForSelector('text=Berth Window Planner', { timeout: 20000 });
await page.waitForTimeout(1200);
await shot('02-berth-planner', 500);

// 03 survey & dry-dock planner
await go('/vessels/survey-planner');
await page.waitForSelector('text=Class Survey & Dry-Dock Planner', { timeout: 20000 });
await page.waitForTimeout(1200);
await shot('03-survey-planner', 500);

// 04 risk matrix
await go('/incidents/risk-matrix');
await page.waitForSelector('text=Initial risk', { timeout: 20000 });
await page.waitForSelector('text=Residual risk');
await shot('04-risk-matrix', 700);

// 05/06 SOF + PDA on a berthed/sailed call
await go('/port-calls');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.click('input[placeholder*="Search" i], input[type="search"]').catch(() => {});
// pick first row directly
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Statement of Facts', { timeout: 15000 });
await page.click('button:has-text("Statement of Facts")');
await page.waitForSelector('text=Chronological record, text=Compiled automatically', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1000);
await shot('05-sof-dialog', 500);
await page.keyboard.press('Escape');
await page.click('button:has-text("Cost estimate")');
await page.waitForTimeout(1200);
const pdaHasGenerate = await page.locator('button:has-text("Generate estimate")').count();
if (pdaHasGenerate) { await page.click('button:has-text("Generate estimate")'); await page.waitForTimeout(1500); }
await shot('06-pda-dialog', 500);
await page.keyboard.press('Escape');

// 07 inspection weighted score + auto-suggest
await go('/inspections');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Checklist', { timeout: 15000 });
await page.waitForTimeout(1200);
await shot('07-inspection-score', 500);

// 08 seafarer sign-on/off wizard
await go('/seafarers');
await page.waitForSelector('text=records', { timeout: 20000 });
await page.locator('tbody tr').first().click();
await page.waitForSelector('text=CDC', { timeout: 15000 });
await page.waitForTimeout(800);
const signBtn = page.locator('button:has-text("Sign on to a vessel"), button:has-text("Sign off")');
if (await signBtn.count()) {
  await signBtn.first().click();
  await page.waitForTimeout(900);
  await shot('08-signon-wizard', 400);
  await page.keyboard.press('Escape');
} else {
  errors.push('No sign-on/off button found on seafarer detail');
}

// 09 licence certificate + QR
await go('/facilities');
await page.waitForSelector('text=records', { timeout: 20000 });
// filter to an ISSUED licence if possible by clicking a row that shows ISSUED chip
const issuedRow = page.locator('tbody tr', { hasText: 'Issued' }).first();
if (await issuedRow.count()) await issuedRow.click(); else await page.locator('tbody tr').first().click();
await page.waitForSelector('text=Audit history', { timeout: 15000 });
const certBtn = page.locator('button:has-text("Print certificate")');
if (await certBtn.count()) {
  await certBtn.click();
  await page.waitForSelector('text=Certificate of Licence', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('09-certificate-qr', 500);
  await page.keyboard.press('Escape');
} else {
  console.log('note: first licence row not ISSUED/SUSPENDED, no certificate button — trying a few more rows');
  await go('/facilities');
  await page.waitForSelector('text=records', { timeout: 15000 });
  const rows = page.locator('tbody tr');
  const n = Math.min(10, await rows.count());
  let done = false;
  for (let i = 0; i < n && !done; i++) {
    await go('/facilities');
    await page.waitForSelector('text=records', { timeout: 15000 });
    await page.locator('tbody tr').nth(i).click();
    await page.waitForSelector('text=Audit history', { timeout: 15000 });
    if (await page.locator('button:has-text("Print certificate")').count()) {
      await page.click('button:has-text("Print certificate")');
      await page.waitForSelector('text=Certificate of Licence', { timeout: 10000 });
      await page.waitForTimeout(1200);
      await shot('09-certificate-qr', 500);
      await page.keyboard.press('Escape');
      done = true;
    }
  }
  if (!done) errors.push('Could not find any ISSUED/SUSPENDED licence to certificate-test');
}

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
