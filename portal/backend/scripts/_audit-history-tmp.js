/* Temporary: per-collection history audit — how far back does each module's data reach? */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const M = require('../src/models');

const NOW = new Date();
const D = 24 * 3600 * 1000;
const yrs = (d) => ((NOW - new Date(d)) / (365 * D)).toFixed(1);

async function span(name, Model, field, extra) {
  const n = await Model.countDocuments();
  if (!n) { console.log(`${name.padEnd(18)} ${String(n).padStart(5)}  — empty`); return; }
  if (!field) { console.log(`${name.padEnd(18)} ${String(n).padStart(5)}  (no dated field) ${extra || ''}`); return; }
  const first = await Model.findOne({ [field]: { $ne: null } }).sort({ [field]: 1 }).select(field).lean();
  const last = await Model.findOne({ [field]: { $ne: null } }).sort({ [field]: -1 }).select(field).lean();
  const f = first && first[field], l = last && last[field];
  if (!f) { console.log(`${name.padEnd(18)} ${String(n).padStart(5)}  ${field}: all null`); return; }
  // distinct years
  const rows = await Model.find({ [field]: { $ne: null } }).select(field).lean();
  const years = [...new Set(rows.map((r) => new Date(r[field]).getFullYear()))].sort();
  console.log(`${name.padEnd(18)} ${String(n).padStart(5)}  ${String(f).slice(0, 10)} → ${String(l).slice(0, 10)}  (${yrs(f)}y back)  years=${years.join(',')}`);
}

async function run() {
  await connectDB();
  console.log('COLLECTION           COUNT  EARLIEST → LATEST (by its natural date field)\n');
  await span('PortCall', M.PortCall, 'eta');
  await span('Invoice', M.Invoice, 'createdAt');
  await span('Inspection', M.Inspection, 'plannedAt');
  await span('Incident', M.Incident, 'reportedAt');
  await span('License', M.License, 'appliedDate');
  await span('Instrument', M.Instrument, 'issuedDate');
  await span('AuditLog', M.AuditLog, 'at');
  await span('Notification', M.Notification, 'createdAt');
  await span('Company', M.Company, 'onboardedAt');
  await span('User', M.User, 'lastLoginAt');
  await span('Position', M.Position, 'receivedAt');
  await span('MdaAlert', M.MdaAlert, 'at');
  await span('Vessel', M.Vessel, null, '(certificates are relative to now)');
  await span('Seafarer', M.Seafarer, null, '(sea-service checked below)');
  await span('Berth', M.Berth, null, '(static master)');
  await span('Resource', M.Resource, null, '(static master — no job history)');
  await span('TariffItem', M.TariffItem, null, '(static master — no rate revisions)');
  await span('Lookup', M.Lookup, null, '(static reference)');
  await span('ChecklistTemplate', M.ChecklistTemplate, null, '(static master)');
  await span('Role', M.Role, null, '(static)');

  // seafarer sea-service depth
  const sf = await M.Seafarer.find().select('seaService').lean();
  const froms = sf.flatMap((s) => (s.seaService || []).map((x) => new Date(x.from)));
  if (froms.length) {
    const min = new Date(Math.min(...froms));
    console.log(`\nSeafarer sea-service: ${froms.length} stints, earliest ${min.toISOString().slice(0, 10)} (${yrs(min)}y back)`);
  }
  // vessel certificate depth
  const vs = await M.Vessel.find().select('certificates lastDryDock').lean();
  const iss = vs.flatMap((v) => (v.certificates || []).map((c) => new Date(c.issueDate)));
  if (iss.length) console.log(`Vessel certificates: ${iss.length} certs, earliest issue ${new Date(Math.min(...iss)).toISOString().slice(0, 10)}`);
  const dd = vs.map((v) => v.lastDryDock).filter(Boolean).map((d) => new Date(d));
  if (dd.length) console.log(`Vessel dry docks:    earliest ${new Date(Math.min(...dd)).toISOString().slice(0, 10)} (${yrs(new Date(Math.min(...dd)))}y back)`);

  // port-call sub-history: how many have full lifecycle vs bare
  const pc = await M.PortCall.countDocuments({ status: 'SAILED' });
  const withCargo = await M.PortCall.countDocuments({ status: 'SAILED', 'cargoOps.0': { $exists: true } });
  console.log(`\nPortCall SAILED ${pc}, with cargo ops ${withCargo}`);

  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
