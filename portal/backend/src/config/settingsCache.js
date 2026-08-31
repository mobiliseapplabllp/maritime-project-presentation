/* In-memory settings cache — lets synchronous domain code (cert windows, prefixes,
 * SLA targets) read admin-controlled settings without a DB round-trip.
 * Loaded at boot; busted by the settings controller on every write. */
const { MODULE_SETTING_DEFAULTS } = require('./constants');

let store = new Map();
let ready = false;

async function init() {
  const Setting = require('../models/Setting');
  const docs = await Setting.find().lean();
  store = new Map(docs.map((d) => [d.key, d.value]));
  ready = true;
}

function get(key, fallback = {}) {
  const v = store.get(key);
  return v === undefined ? fallback : v;
}

// Module-scoped settings merged over their defaults
function moduleGet(modKey) {
  const defaults = MODULE_SETTING_DEFAULTS[modKey] || {};
  return { ...defaults, ...(store.get(`module:${modKey}`) || {}) };
}

function set(key, value) { store.set(key, value); }
function isReady() { return ready; }

module.exports = { init, get, moduleGet, set, isReady };
