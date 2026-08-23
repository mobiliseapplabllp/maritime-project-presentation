/* Platform settings — global sections (organisation, operations, billing,
 * notifications, SMTP, AI) plus per-module settings that loop back into
 * module behaviour through the settings cache. */
const { Setting } = require('../models');
const { MODULE_SETTING_DEFAULTS } = require('../config/constants');
const cache = require('../config/settingsCache');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

const SECTIONS = {
  org: {
    label: 'Organisation profile',
    fields: ['portName', 'operator', 'unlocode', 'address', 'gstin', 'currency', 'timezone', 'contactEmail', 'contactPhone'],
  },
  operations: {
    label: 'Operations',
    fields: ['workingHours', 'pilotBoardingGround', 'vhfWorkingChannel', 'marsecLevel', 'monsoonMode'],
    defaults: { workingHours: '24×365', pilotBoardingGround: '3 NM SE of breakwaters', vhfWorkingChannel: 'Ch 12', marsecLevel: 1, monsoonMode: false },
  },
  billing: {
    label: 'Billing & tax',
    fields: ['gstRate', 'placeOfSupply', 'sacCode', 'roundToRupee', 'creditNoteApproval'],
    defaults: { gstRate: 18, placeOfSupply: 'Gujarat (24)', sacCode: '996751', roundToRupee: true, creditNoteApproval: true },
  },
  notifications: {
    label: 'Notifications',
    fields: ['certExpiryDigest', 'incidentPush', 'invoiceOverdueDigest', 'digestHourIst'],
    defaults: { certExpiryDigest: true, incidentPush: true, invoiceOverdueDigest: true, digestHourIst: 8 },
  },
  smtp: {
    label: 'SMTP (outbound mail)',
    fields: ['host', 'port', 'secure', 'username', 'password', 'fromName', 'fromEmail', 'enabled'],
    defaults: { host: '', port: 587, secure: true, username: '', password: '', fromName: 'Mundra Port Operations', fromEmail: 'noreply@mundraport.in', enabled: false },
    secret: ['password'],
  },
  ai: {
    label: 'AI assistant',
    fields: ['enabled', 'provider', 'model', 'apiKey', 'temperature', 'groundedOnly', 'dailyTokenBudget'],
    defaults: { enabled: true, provider: 'anthropic', model: 'claude-opus-5', apiKey: '', temperature: 0.2, groundedOnly: false, dailyTokenBudget: 500000 },
    secret: ['apiKey'],
  },
};

const mask = (section, value) => {
  const out = { ...value };
  for (const f of SECTIONS[section]?.secret || []) {
    if (out[f]) out[f] = `••••${String(out[f]).slice(-4)}`;
  }
  return out;
};

exports.getAll = async (_req, res) => {
  const docs = await Setting.find({ key: { $in: Object.keys(SECTIONS) } }).lean();
  const byKey = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  const out = {};
  for (const [k, s] of Object.entries(SECTIONS)) {
    out[k] = mask(k, { ...(s.defaults || {}), ...(byKey[k] || {}) });
  }
  out._sections = Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, s.label]));
  ok(res, out);
};

exports.updateSection = async (req, res) => {
  const section = req.params.section;
  const spec = SECTIONS[section];
  if (!spec) throw new ApiError(404, `Unknown settings section "${section}"`);
  const incoming = req.body || {};
  const value = {};
  for (const f of spec.fields) if (incoming[f] !== undefined) value[f] = incoming[f];
  // never persist a masked secret back over the real one
  for (const f of spec.secret || []) {
    if (typeof value[f] === 'string' && value[f].startsWith('••••')) delete value[f];
  }
  if (!Object.keys(value).length) throw new ApiError(400, 'Nothing to update');
  const before = await Setting.findOne({ key: section }).lean();
  const doc = await Setting.findOneAndUpdate(
    { key: section },
    { $set: Object.fromEntries(Object.entries(value).map(([k, v]) => [`value.${k}`, v])) },
    { new: true, upsert: true },
  );
  cache.set(section, doc.value);
  audit(req, { action: 'UPDATE', entity: 'Setting', entityId: section, entityLabel: spec.label,
    before: before && mask(section, before.value), after: mask(section, doc.value) });
  ok(res, mask(section, { ...(spec.defaults || {}), ...doc.value }));
};

// SMTP "test connection" — validates the stored profile; transport is simulated
// in this environment (no outbound relay), so we report what would be attempted.
exports.smtpTest = async (req, res) => {
  const doc = await Setting.findOne({ key: 'smtp' }).lean();
  const smtp = { ...SECTIONS.smtp.defaults, ...((doc && doc.value) || {}), ...(req.body || {}) };
  if (!smtp.host) throw new ApiError(400, 'SMTP host is required');
  if (!smtp.port || smtp.port < 1 || smtp.port > 65535) throw new ApiError(400, 'SMTP port must be between 1 and 65535');
  if (smtp.username && !smtp.password) throw new ApiError(400, 'Password is required when a username is set');
  ok(res, {
    status: 'SIMULATED_OK',
    detail: `Would connect to ${smtp.host}:${smtp.port} (${smtp.secure ? 'TLS' : 'plain'})${smtp.username ? ` as ${smtp.username}` : ' anonymously'} and send from "${smtp.fromName}" <${smtp.fromEmail}>. Outbound relay is disabled in the demo environment.`,
    checkedAt: new Date().toISOString(),
  });
};

exports.getModule = async (req, res) => {
  const key = req.params.key;
  if (!MODULE_SETTING_DEFAULTS[key]) throw new ApiError(404, `Unknown module "${key}"`);
  const doc = await Setting.findOne({ key: `module:${key}` }).lean();
  ok(res, { ...MODULE_SETTING_DEFAULTS[key], ...((doc && doc.value) || {}) }, { defaults: MODULE_SETTING_DEFAULTS[key] });
};

exports.updateModule = async (req, res) => {
  const key = req.params.key;
  const defaults = MODULE_SETTING_DEFAULTS[key];
  if (!defaults) throw new ApiError(404, `Unknown module "${key}"`);
  const incoming = req.body || {};
  const value = {};
  for (const f of Object.keys(defaults)) if (incoming[f] !== undefined) value[f] = incoming[f];
  if (!Object.keys(value).length) throw new ApiError(400, 'Nothing to update');
  const before = await Setting.findOne({ key: `module:${key}` }).lean();
  const doc = await Setting.findOneAndUpdate(
    { key: `module:${key}` },
    { $set: Object.fromEntries(Object.entries(value).map(([k, v]) => [`value.${k}`, v])) },
    { new: true, upsert: true },
  );
  cache.set(`module:${key}`, doc.value);
  audit(req, { action: 'UPDATE', entity: 'Setting', entityId: `module:${key}`, entityLabel: `Module settings — ${key}`,
    before: before && before.value, after: doc.value });
  ok(res, { ...defaults, ...doc.value });
};
