import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = '/tmp/claude-0/-home-user-PLI-Portal/853b5fc9-c359-5406-b2e8-559cc0bf6f4f/scratchpad/shots';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1580, height: 1000 } });
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', (e) => errors.push(String(e)));

await p.goto('http://127.0.0.1:5300/login', { waitUntil: 'networkidle' });
await p.click('text=Super Admin');
await p.waitForTimeout(2500);

const shot = async (path, name, wait = 1800) => {
  await p.goto(`http://127.0.0.1:5300${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(name, '::', (await p.title()) || '', '::', path);
};

await shot('/registry', 'reg-list');
const text = await p.textContent('body');
console.log('list shows applications:', /REG-\d{4}-\d{5}/.test(text), '| stat cards:', (text.match(/On the register/g) || []).length);

// open the first row
await p.click('table tbody tr');
await p.waitForTimeout(2200);
await p.screenshot({ path: `${OUT}/reg-detail.png` });
console.log('detail url:', p.url());
const dtext = await p.textContent('body');
console.log('detail shows checks:', /Assessment/.test(dtext), '| ownership tab:', /Ownership/.test(dtext));

// tabs
for (const [i, name] of [[1, 'ownership'], [2, 'evidence'], [3, 'carving'], [5, 'history']]) {
  const tabs = await p.$$('button[role=tab]');
  if (tabs[i]) { await tabs[i].click(); await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/reg-tab-${name}.png` }); }
}

// the blocked closure
await p.goto('http://127.0.0.1:5300/registry', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const rows = await p.$$('table tbody tr');
for (const r of rows) {
  const t = await r.textContent();
  if (/Closure/.test(t) && /Under scrutiny/.test(t)) { await r.click(); break; }
}
await p.waitForTimeout(2200);
await p.screenshot({ path: `${OUT}/reg-blocked.png` });
console.log('blocked closure shows the alert:', /statutory condition/.test(await p.textContent('body')));

// vessel registry tab — pick a ship that IS on the register
await p.goto('http://127.0.0.1:5300/registry', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
{
  const rs = await p.$$('table tbody tr');
  for (const r of rs) { const t = await r.textContent(); if (/Permanent/.test(t) && /Granted/.test(t)) { await r.click(); break; } }
  await p.waitForTimeout(1800);
  await p.click('text=Open the ship');
}
await p.waitForTimeout(1800);
const vtabs = await p.$$('button[role=tab]');
await vtabs[vtabs.length - 1].click();
await p.waitForTimeout(1800);
await p.screenshot({ path: `${OUT}/vessel-registry.png` });
const rt = await p.textContent('body');
console.log('vessel registry tab shows an entry:', /Official number/.test(rt) && /Registry transactions/.test(rt),
  '| unregistered wording present:', /never been entered/.test(rt));

await shot('/certificates', 'certificates');
const ctext = await p.textContent('body');
console.log('certificates page shows register column:', /In force|Not in force|Issued elsewhere/.test(ctext));

console.log('console errors:', errors.length ? errors.slice(0, 6) : 'none');
await b.close();
