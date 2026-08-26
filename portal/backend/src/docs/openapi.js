/* A4 — OpenAPI 3.1 description of the whole API.
 *
 * RFP §7.1 asks for API-first design with documented REST APIs for all
 * capabilities, and §5.4.2 for a published API layer enabling future
 * integrations. Rather than maintain a second document that drifts from the
 * code, the specification is derived from the route table itself: every path,
 * method and — crucially — the permission that guards it.
 *
 * Deriving it means it cannot go stale. A route added without documentation
 * still appears, and a permission changed in code changes here too. */
const fs = require('fs');
const path = require('path');
const { PERMISSION_GROUPS } = require('../config/constants');
const pkg = require('../../package.json');

const ROUTES_FILE = path.join(__dirname, '..', 'routes', 'index.js');

// `r.get('/vessels/:id', requirePerm('vessels.view'), w(vessels.get));`
const ROUTE_RX = /^r\.(get|post|put|delete|patch)\(\s*'([^']+)'\s*(?:,\s*requirePerm\('([^']+)'\))?[^)]*?w\(([\w.]+)\)/;

// Tags come from the path root, not from comments in the route file. Comments
// drift and a new route silently inherits whatever section it happens to sit
// under; the path root is the route's own identity and cannot go stale.
const TAG_BY_ROOT = {
  health: 'Service health', public: 'Public', auth: 'Authentication',
  search: 'Search', meta: 'Platform metadata', cards: 'Hover cards',
  notifications: 'Notifications', dashboard: 'Command centre',
  vessels: 'Vessel registry', 'port-calls': 'Port calls', berths: 'Berths',
  ops: 'Harbour operations', tracking: 'Maritime surveillance',
  seafarers: 'Crew & manning', instruments: 'Notices & circulars',
  inspections: 'Survey & audit', incidents: 'Incident desk',
  risk: 'Risk intelligence', licenses: 'Licensing & instruments',
  companies: 'Port companies', services: 'Service requests',
  agents: 'AI agents & autonomy', ai: 'AI assistant',
  registrations: 'Ship registration',
  invoices: 'Revenue & billing', tariffs: 'Tariff master',
  reports: 'MIS reports', users: 'Users', roles: 'Roles & permissions',
  audit: 'Audit trail', settings: 'Settings', 'module-settings': 'Module settings',
};

const titleise = (s) => s.replace(/-/g, ' ').replace(/^[a-z]/, (c) => c.toUpperCase());
const tagFor = (routePath) => {
  const root = routePath.split('/')[1] || 'general';
  return TAG_BY_ROOT[root] || titleise(root);
};

/** Read the route table and return one entry per endpoint. */
function parseRoutes() {
  const src = fs.readFileSync(ROUTES_FILE, 'utf8');
  const out = [];
  let sawUse = false;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('r.use(authenticate)')) { sawUse = true; continue; }
    const m = ROUTE_RX.exec(line);
    if (!m) continue;
    const [, method, routePath, perm, handler] = m;
    out.push({
      method, path: routePath, perm: perm || null, handler,
      tag: tagFor(routePath),
      secured: sawUse && !routePath.startsWith('/public/') && routePath !== '/health',
    });
  }
  return out;
}

const HUMAN = {
  get: 'Retrieve', post: 'Create', put: 'Update', delete: 'Delete', patch: 'Modify',
};

// Trailing path segments that name an action rather than a resource.
const ACTIONS = {
  transition: 'Move through its lifecycle', issue: 'Issue the instrument',
  checks: 'Dry-run the eligibility checks', suspend: 'Suspend or reinstate',
  review: 'Accept or overturn', approve: 'Approve', pay: 'Record payment',
  close: 'Close', reopen: 'Reopen', dashboard: 'Dashboard', catalogue: 'Catalogue',
  verify: 'Verify', export: 'Export', run: 'Run', stats: 'Summary statistics',
  documents: 'Supporting documents', audits: 'Audit records', instruments: 'Issued instruments',
  history: 'History', outages: 'Out-of-service windows', voyages: 'Voyages', movements: 'Movements',
  certificates: 'Certificates', utilisation: 'Utilisation', downtime: 'Downtime',
  grant: 'Grant and write the register', reference: 'Form reference data',
  evidence: 'Supporting evidence', encumbrances: 'Registered charges',
  'carving-compliance': 'Record carving and marking compliance',
  endorsements: 'Survey endorsements', transcript: 'Transcript of registry',
  registrations: 'Registry transactions', 'signing-key': 'Certificate signing key',
};

const singular = (w) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') ? w.slice(0, -1) : w);
const pretty = (w) => singular(w).replace(/-/g, ' ');

/** A readable summary derived from the method and path. */
function summarise(r) {
  const segs = r.path.split('/').filter(Boolean);
  const words = segs.filter((p) => !p.startsWith(':'));
  const last = words[words.length - 1];
  // "/services/requests" is a service request, not a service — singularise the
  // final word and the qualifiers before it, keeping the whole phrase
  const resource = words.map((w, i) => (i < words.length - 1 ? pretty(w) : pretty(w))).join(' ') || 'record';
  const plural = words.map((w, i) => (i < words.length - 1 ? pretty(w) : w.replace(/-/g, ' '))).join(' ');
  const scoped = r.path.includes('/:');

  // an action verb at the end describes the operation
  if (words.length > 1 && ACTIONS[last]) {
    const subject = words.length > 2 ? pretty(words[words.length - 2]) : resource;
    return `${ACTIONS[last]} — ${subject}`;
  }
  if (r.method === 'get') return scoped ? `Retrieve one ${resource}` : `List ${plural}`;
  if (r.method === 'post') return `Create a ${resource}`;
  if (r.method === 'put' || r.method === 'patch') return `Update a ${resource}`;
  if (r.method === 'delete') return `Delete a ${resource}`;
  return `${HUMAN[r.method]} ${words.join(' ').replace(/-/g, ' ')}`;
}

const pathParams = (p) => (p.match(/:(\w+)/g) || []).map((s) => s.slice(1));

const ENVELOPE = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { description: 'The payload — an object or an array depending on the endpoint' },
    meta: {
      type: 'object', nullable: true,
      description: 'Pagination and aggregate counts, present on list endpoints',
      properties: {
        total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' },
      },
    },
  },
  required: ['success'],
};

const ERROR = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'You don\'t have permission to do this (vessels.edit)' },
  },
};

/** Build the OpenAPI document. */
function buildSpec({ baseUrl = '/api' } = {}) {
  const routes = parseRoutes();
  const paths = {};
  const tags = new Set();

  for (const r of routes) {
    tags.add(r.tag);
    const key = r.path.replace(/:(\w+)/g, '{$1}');
    paths[key] = paths[key] || {};
    const params = pathParams(r.path).map((name) => ({
      name, in: 'path', required: true, schema: { type: 'string' },
      description: name === 'id' ? 'Record identifier' : name,
    }));
    if (r.method === 'get' && !r.path.includes(':')) {
      params.push(
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 }, description: 'Records per page' },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search' },
        { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Sort field, prefix with - to reverse' },
      );
    }
    paths[key][r.method] = {
      tags: [r.tag],
      summary: summarise(r),
      description: r.perm
        ? `Requires the \`${r.perm}\` permission. Handled by \`${r.handler}\`.`
        : `Handled by \`${r.handler}\`.`,
      operationId: `${r.method}${key.replace(/[^\w]/g, '_')}`,
      ...(r.perm ? { 'x-permission': r.perm } : {}),
      parameters: params.length ? params : undefined,
      ...(['post', 'put', 'patch'].includes(r.method)
        ? { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } : {}),
      security: r.secured ? [{ bearerAuth: [] }] : [],
      responses: {
        200: { description: 'Success', content: { 'application/json': { schema: ENVELOPE } } },
        ...(r.method === 'post' ? { 201: { description: 'Created', content: { 'application/json': { schema: ENVELOPE } } } } : {}),
        ...(r.secured ? {
          401: { description: 'Authentication required', content: { 'application/json': { schema: ERROR } } },
          403: { description: 'Permission denied', content: { 'application/json': { schema: ERROR } } },
        } : {}),
        404: { description: 'Not found', content: { 'application/json': { schema: ERROR } } },
        409: { description: 'Conflict — the workflow does not permit this transition', content: { 'application/json': { schema: ERROR } } },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Mundra Port Operations Portal API',
      version: pkg.version || '1.0.0',
      description: [
        'Every capability in the platform is reachable through this API. Responses share one envelope:',
        '`{ success, data, meta? }` on success and `{ success: false, message }` on failure.',
        '',
        'Authentication is a bearer JWT obtained from `POST /auth/login`; access tokens are short-lived and',
        'renewed through `POST /auth/refresh`. Authorisation is deny-by-default: each endpoint declares the',
        'permission it requires in `x-permission`, and a role must hold that exact permission.',
        '',
        'This document is generated from the route table itself, so it cannot drift from the running service.',
      ].join('\n'),
    },
    servers: [{ url: baseUrl, description: 'This deployment' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: { Envelope: ENVELOPE, Error: ERROR },
    },
    'x-permission-groups': PERMISSION_GROUPS.map((g) => ({
      module: g.module, label: g.label, permissions: g.actions.map((a) => `${g.module}.${a}`),
    })),
  };
}

/** Coverage figures, used by the docs page and worth asserting in tests. */
function specStats() {
  const routes = parseRoutes();
  return {
    endpoints: routes.length,
    secured: routes.filter((r) => r.secured).length,
    withPermission: routes.filter((r) => r.perm).length,
    publicEndpoints: routes.filter((r) => !r.secured).length,
    tags: [...new Set(routes.map((r) => r.tag))].length,
  };
}

module.exports = { buildSpec, parseRoutes, specStats };
