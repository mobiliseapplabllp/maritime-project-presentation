const { PortCall, Vessel, Berth, Lookup, Notification } = require('../models');
const { canTransition } = require('../domain/transitions');
const { findBerthConflict } = require('../domain/berthConflict');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

const ACTIVE_STATUSES = ['CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'];
const EDITABLE = ['eta', 'etb', 'etd', 'agentCode', 'agentName', 'purpose', 'prevPort', 'nextPort',
  'draftArrival', 'draftDeparture', 'crew', 'remarks', 'berth'];

async function assertNoBerthConflict(berthId, from, to, excludeId) {
  const berth = await Berth.findById(berthId);
  if (!berth) throw new ApiError(400, 'Selected berth does not exist');
  if (berth.status !== 'OPERATIONAL') throw new ApiError(400, `Berth ${berth.code} is under maintenance`);
  const active = await PortCall.find({ berth: berthId, status: { $in: ACTIVE_STATUSES } })
    .select('vcn berth atb etb etd').lean();
  const clash = findBerthConflict(active, berthId, from, to, excludeId);
  if (clash) throw new ApiError(409, `Berth ${berth.code} is held by call ${clash.vcn} in that window`);
  return berth;
}

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-eta' });
  const filter = {};
  for (const f of ['status', 'berth', 'vessel', 'agentCode']) {
    if (req.query[f]) filter[f] = req.query[f];
  }
  if (req.query.active === 'true') filter.status = { $in: ['ANNOUNCED', ...ACTIVE_STATUSES] };
  const search = searchFilter(req.query.q, ['vcn']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    PortCall.find(filter).sort(sort).skip(skip).limit(limit)
      .populate('vessel', 'name imo type flag').populate('berth', 'code name terminal'),
    PortCall.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const call = await PortCall.findById(req.params.id)
    .populate('vessel').populate('berth', 'code name terminal berthType');
  if (!call) throw new ApiError(404, 'Port call not found');
  ok(res, call);
};

exports.create = async (req, res) => {
  const { vessel, eta, etd, agentCode, purpose, prevPort, nextPort, remarks } = req.body || {};
  if (!vessel || !eta) throw new ApiError(400, 'Vessel and ETA are required');
  const v = await Vessel.findById(vessel);
  if (!v) throw new ApiError(400, 'Vessel not found');
  if (v.status !== 'ACTIVE') throw new ApiError(400, `${v.name} is marked inactive in the registry`);
  let agentName = '';
  if (agentCode) {
    const a = await Lookup.findOne({ category: 'agent', code: agentCode });
    agentName = a ? a.label : '';
  }
  const call = await PortCall.create({
    vcn: await nextNumber(PortCall, 'vcn', `${require('../config/settingsCache').moduleGet('ops').vcnPrefix || 'MUN'}-${new Date(eta).getFullYear()}-`),
    vessel, eta, etd, agentCode: agentCode || '', agentName,
    purpose: purpose || '', prevPort: prevPort || '', nextPort: nextPort || '',
    remarks: remarks || '',
    statusHistory: [{ from: '', to: 'ANNOUNCED', at: new Date(), by: req.user.name, note: 'Call announced' }],
  });
  audit(req, { action: 'CREATE', entity: 'PortCall', entityId: call._id, entityLabel: call.vcn, after: call });
  created(res, call);
};

exports.update = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  if (['SAILED', 'CANCELLED'].includes(call.status)) {
    throw new ApiError(400, `A ${call.status.toLowerCase()} call is read-only`);
  }
  const before = call.toObject();
  const body = req.body || {};
  if (body.berth && String(body.berth) !== String(call.berth || '')) {
    const from = new Date(body.etb || call.etb || call.eta);
    const to = new Date(body.etd || call.etd || from.getTime() + 48 * 3600 * 1000);
    await assertNoBerthConflict(body.berth, from, to, call._id);
  }
  for (const f of EDITABLE) if (body[f] !== undefined) call[f] = body[f];
  await call.save();
  audit(req, { action: 'UPDATE', entity: 'PortCall', entityId: call._id, entityLabel: call.vcn, before, after: call });
  ok(res, call);
};

exports.transition = async (req, res) => {
  const call = await PortCall.findById(req.params.id).populate('vessel', 'name');
  if (!call) throw new ApiError(404, 'Port call not found');
  const { to, at, berth, note } = req.body || {};
  const check = canTransition(call.status, to);
  if (!check.ok) throw new ApiError(409, check.error);
  const when = at ? new Date(at) : new Date();
  const from = call.status;

  if (to === 'AT_ANCHORAGE') call.ata = call.ata || when;
  if (to === 'BERTHED') {
    const berthId = berth || call.berth;
    if (!berthId) throw new ApiError(400, 'Select a berth before berthing the vessel');
    const winEnd = call.etd ? new Date(call.etd) : new Date(when.getTime() + 48 * 3600 * 1000);
    const b = await assertNoBerthConflict(berthId, when, winEnd, call._id);
    call.berth = berthId;
    call.ata = call.ata || when;
    call.atb = when;
    Notification.create({
      title: `${call.vessel.name} berthed at ${b.code}`,
      body: `Call ${call.vcn} — berthed ${when.toISOString().slice(0, 16).replace('T', ' ')} LT`,
      severity: 'info', link: `/port-calls/${call._id}`, audiencePerm: 'portcalls.view',
    }).catch(() => {});
  }
  if (to === 'SAILED') {
    call.atd = when;
    if (!call.atb) throw new ApiError(400, 'Cannot sail a call that never berthed');
  }
  if (to === 'CANCELLED' && !note) throw new ApiError(400, 'A cancellation note is required');

  call.status = to;
  call.statusHistory.push({ from, to, at: when, by: req.user.name, note: note || '' });
  await call.save();
  audit(req, { action: 'TRANSITION', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn}: ${from} → ${to}` });
  ok(res, call);
};

// ---- services sub-resource ----
exports.addService = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  const { type, tariffCode, description, qty, unit, at, remarks } = req.body || {};
  if (!type) throw new ApiError(400, 'Service type is required');
  call.services.push({ type, tariffCode, description, qty: qty || 1, unit, at, remarks });
  await call.save();
  audit(req, { action: 'SERVICE_ADD', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn} — ${type}` });
  created(res, call);
};

exports.removeService = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  const svc = call.services.id(req.params.serviceId);
  if (!svc) throw new ApiError(404, 'Service entry not found');
  audit(req, { action: 'SERVICE_DELETE', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn} — ${svc.type}`, before: svc.toObject() });
  svc.deleteOne();
  await call.save();
  ok(res, call);
};

// ---- cargo operations sub-resource ----
async function mtFactor(cargoType) {
  const lk = await Lookup.findOne({ category: 'cargoType', code: cargoType });
  return (lk && lk.meta && lk.meta.mtFactor) || 1;
}

exports.addCargoOp = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  const { cargoType, operation, qty, unit, gangs, startedAt, completedAt, remarks } = req.body || {};
  if (!cargoType || !operation || !qty || !unit) throw new ApiError(400, 'Cargo type, operation, quantity and unit are required');
  const factor = unit === 'MT' ? 1 : await mtFactor(cargoType);
  call.cargoOps.push({ cargoType, operation, qty, unit, qtyMT: Math.round(qty * factor), gangs, startedAt, completedAt, remarks });
  await call.save();
  audit(req, { action: 'CARGO_ADD', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn} — ${cargoType} ${qty} ${unit}` });
  created(res, call);
};

exports.updateCargoOp = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  const op = call.cargoOps.id(req.params.opId);
  if (!op) throw new ApiError(404, 'Cargo operation not found');
  const before = op.toObject();
  for (const f of ['cargoType', 'operation', 'qty', 'unit', 'gangs', 'startedAt', 'completedAt', 'remarks']) {
    if (req.body[f] !== undefined) op[f] = req.body[f];
  }
  op.qtyMT = op.unit === 'MT' ? op.qty : Math.round(op.qty * (await mtFactor(op.cargoType)));
  await call.save();
  audit(req, { action: 'CARGO_UPDATE', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn} — ${op.cargoType}`, before, after: op.toObject() });
  ok(res, call);
};

exports.removeCargoOp = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  const op = call.cargoOps.id(req.params.opId);
  if (!op) throw new ApiError(404, 'Cargo operation not found');
  audit(req, { action: 'CARGO_DELETE', entity: 'PortCall', entityId: call._id, entityLabel: `${call.vcn} — ${op.cargoType}`, before: op.toObject() });
  op.deleteOne();
  await call.save();
  ok(res, call);
};

exports.remove = async (req, res) => {
  const call = await PortCall.findById(req.params.id);
  if (!call) throw new ApiError(404, 'Port call not found');
  if (!['ANNOUNCED', 'CANCELLED'].includes(call.status)) {
    throw new ApiError(400, 'Only announced or cancelled calls can be deleted — the rest are operational record');
  }
  await call.deleteOne();
  audit(req, { action: 'DELETE', entity: 'PortCall', entityId: call._id, entityLabel: call.vcn, before: call });
  ok(res, { deleted: true });
};
