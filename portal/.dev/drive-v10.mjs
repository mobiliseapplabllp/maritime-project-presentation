/* Walks every page that carries a stat strip and proves the strip is real:
 * the expected number of cards, every value populated, no NaN/undefined leaking
 * into a label or hint. Runs against the live app or the built demo bundle —
 * `node drive-v10.mjs [base] [demo]`. */
import { chromium } from '/home/user/maritime-project-presentation/portal/frontend/node_modules/playwright-core/index.mjs';

const BASE = process.argv[2] || 'http://localhost:5200';
const DEMO = process.argv[3] === 'demo';
const OUT = '/home/user/maritime-project-presentation/portal/.dev/shots/';
const TAG = DEMO ? 'v10-demo' : 'v10';
const IGNORE = /fonts\.googleapis|fonts\.gstatic|ERR_CONNECTION_RESET|favicon/;
const errors = [], checks = [];

// scope, route, expected card count, and whether it is worth a screenshot
const PAGES = [
  ['portcalls',    '/port-calls',      8, true],
  ['berths',       '/berth-board',     8, false],
  ['vessels',      '/vessels',         8, false],
  ['certificates', '/certificates',    8, false],
  ['seafarers',    '/seafarers',       8, false],
  ['legislation',  '/legislation',     8, false],
  ['facilities',   '/facilities',      8, false],
  ['inspections',  '/inspections',     8, true],
  ['incidents',    '/incidents',       8, false],
  ['invoices',     '/invoices',        8, true],
  ['risk',         '/risk',            4, false],
  ['masters',      '/masters/berths',  8, false],
  ['tariffs',      '/masters/tariffs', 8, true],
  ['marine',       '/marine-services', 8, true],
  ['audit',        '/admin/audit',     8, true],
  ['users',        '/admin/users',     8, false],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 220)}`); });
page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console: ${m.text().slice(0, 220)}`); });

// the demo bundle is statically hosted, so it ships with HashRouter
const go = async (p) => { await page.goto(DEMO ? `${BASE}/#${p}` : `${BASE}${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(300); };
const check = (label, v) => {
  if (v) checks.push(`PASS  ${label}${typeof v === 'string' ? ` — ${v}` : ''}`);
  else { checks.push(`FAIL  ${label}`); errors.push(`assertion failed: ${label}`); }
};

await go('/login');
await page.click('text=Super Admin');
await page.waitForSelector('text=Cargo throughput', { timeout: 40000 });
console.log(`logged in (${DEMO ? 'demo bundle' : 'live'}) at ${BASE}`);

for (const [scope, route, want, snap] of PAGES) {
  await go(route);
  const strip = page.locator(`[data-stats-scope="${scope}"]`);
  let cards = [];
  try {
    await strip.waitFor({ timeout: 30000 });
    // wait out the skeleton — a real card always renders a value line
    await page.waitForFunction((sc) => {
      const el = document.querySelector(`[data-stats-scope="${sc}"]`);
      if (!el) return false;
      const first = el.querySelector('.MuiCard-root');
      return first && first.innerText.trim().length > 0 && !first.querySelector('.MuiSkeleton-root');
    }, scope, { timeout: 30000 });
    await page.waitForTimeout(250);
    cards = await strip.locator('.MuiCard-root').allInnerTexts();
  } catch (e) {
    check(`${scope} strip renders`, false);
    continue;
  }
  const bad = cards.filter((t) => /NaN|undefined|Infinity|\[object/.test(t));
  const empty = cards.filter((t) => !t.trim());
  const labels = cards.map((t) => t.split('\n').slice(0, 2).reverse().join('=').trim());
  check(`${scope.padEnd(12)} ${String(cards.length).padStart(2)} cards on ${route}`,
    cards.length === want && !bad.length && !empty.length ? labels.join(' | ') : false);
  if (bad.length) errors.push(`${scope}: junk in card — ${bad[0].replace(/\n/g, ' ')}`);
  if (snap) {
    await page.screenshot({ path: `${OUT}${TAG}-${scope}.png`, fullPage: false });
    console.log('  shot →', `${TAG}-${scope}.png`);
  }
}

console.log(`\n--- ${DEMO ? 'demo' : 'live'} stat strips ---`);
checks.forEach((c) => console.log(' ', c));
console.log(`\n--- console/page errors (${errors.length}) ---`);
errors.slice(0, 12).forEach((e) => console.log(' ', e));
await browser.close();
process.exit(errors.length ? 1 : 0);
