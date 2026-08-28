/* A4 — serve the generated OpenAPI document and a browsable reference. */
const { buildSpec, specStats } = require('../docs/openapi');
const { ok } = require('../utils/respond');

const specFor = (req) => buildSpec({
  baseUrl: `${req.protocol}://${req.get('host')}/api`,
});

exports.spec = (req, res) => res.json(specFor(req));

exports.stats = (_req, res) => ok(res, specStats());

/* A single self-contained reference page. No CDN — the deployment must work on
 * an air-gapped network, which rules out loading a documentation bundle. */
exports.page = (req, res) => {
  const spec = specFor(req);
  const s = specStats();
  const byTag = {};
  Object.entries(spec.paths).forEach(([p, methods]) => {
    Object.entries(methods).forEach(([m, op]) => {
      (byTag[op.tags[0]] = byTag[op.tags[0]] || []).push({ path: p, method: m, op });
    });
  });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const METHOD_COLOUR = { get: '#2f6f4e', post: '#1f5b8f', put: '#8a5a10', delete: '#96322c', patch: '#5a3f8f' };

  const sections = Object.keys(byTag).sort().map((tag) => {
    const rows = byTag[tag].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, method, op }) => `
      <tr>
        <td><span class="m" style="background:${METHOD_COLOUR[method]}">${method.toUpperCase()}</span></td>
        <td class="p">${esc(path)}</td>
        <td>${esc(op.summary)}</td>
        <td class="perm">${op['x-permission'] ? `<code>${esc(op['x-permission'])}</code>` : '<span class="any">any signed-in user</span>'}</td>
      </tr>`).join('');
    return `<section><h2>${esc(tag)} <span class="count">${byTag[tag].length}</span></h2>
      <table><thead><tr><th></th><th>Path</th><th>Purpose</th><th>Permission</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');

  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API reference — Maritime Operations Portal</title>
<style>
:root{--bg:#fbfcfd;--panel:#fff;--ink:#12212b;--muted:#5b7180;--rule:#dde5ea;--accent:#0a6b74}
@media (prefers-color-scheme:dark){:root{--bg:#0d1a22;--panel:#132530;--ink:#e8f0f4;--muted:#93aab8;--rule:#22404f;--accent:#4fb3bd}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 72px}
h1{font-size:26px;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 22px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:28px}
.stat{background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:10px 14px;min-width:120px}
.stat b{display:block;font-size:20px}
.stat span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
section{background:var(--panel);border:1px solid var(--rule);border-radius:10px;margin-bottom:16px;overflow:hidden}
h2{font-size:14px;letter-spacing:.05em;text-transform:uppercase;margin:0;padding:12px 16px;border-bottom:1px solid var(--rule);color:var(--accent)}
h2 .count{color:var(--muted);font-weight:400}
table{width:100%;border-collapse:collapse}
td,th{padding:8px 16px;text-align:left;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:none}
.m{display:inline-block;color:#fff;font:600 10px/1 ui-monospace,monospace;padding:5px 7px;border-radius:4px;letter-spacing:.04em}
.p{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.perm code{font-family:ui-monospace,monospace;font-size:12px;color:var(--accent)}
.any{color:var(--muted);font-size:12px;font-style:italic}
a{color:var(--accent)}
footer{color:var(--muted);font-size:13px;margin-top:26px}
</style></head><body><div class="wrap">
<h1>API reference</h1>
<p class="sub">Maritime Operations Portal · generated from the route table, so it cannot drift from the running service.
Machine-readable: <a href="/api/openapi.json">openapi.json</a></p>
<div class="stats">
  <div class="stat"><b>${s.endpoints}</b><span>Endpoints</span></div>
  <div class="stat"><b>${s.withPermission}</b><span>Permission-gated</span></div>
  <div class="stat"><b>${s.publicEndpoints}</b><span>Public</span></div>
  <div class="stat"><b>${s.tags}</b><span>Modules</span></div>
</div>
${sections}
<footer>Authentication is a bearer JWT from <code>POST /auth/login</code>. Authorisation is deny-by-default:
an endpoint is reachable only when the signed-in role holds the exact permission shown.</footer>
</div></body></html>`);
};

/* F5 — the active jurisdiction profile: benchmarks, PSC regime, tax and
 * currency conventions. Public, because an integrator needs to know which
 * conventions the deployment runs on before they hold credentials. */
const { getProfile, benchmarksFor, unconfirmed, PROFILES, DEFAULT_JURISDICTION } = require('../config/jurisdictions');
const { Setting } = require('../models');

async function activeCode() {
  const s = await Setting.findOne({ key: 'org' }).lean();
  return (s && s.value && s.value.jurisdiction) || DEFAULT_JURISDICTION;
}

exports.jurisdiction = async (req, res) => {
  const code = String(req.query.code || await activeCode()).toUpperCase();
  const p = getProfile(code);
  ok(res, {
    active: code,
    available: Object.keys(PROFILES).map((k) => ({ code: k, name: PROFILES[k].name })),
    profile: {
      code: p.code, name: p.name, authority: p.authority, regulatorNote: p.regulatorNote,
      pscRegime: p.pscRegime, currency: p.currency, tax: p.tax, workingWeek: p.workingWeek,
    },
    benchmarks: benchmarksFor(code),
    unconfirmed: unconfirmed(code).map((b) => b.key),
  });
};
