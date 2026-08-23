/* Harbour operations depth — the 2D quay twin, the day-wise vessel schedule
 * and the marine resource (tugs / pilot launches / pilots) board. */
const { Berth, PortCall, Resource } = require('../models');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

const D = 24 * 3600 * 1000;

// Everything the quay-view twin needs in one call.
exports.twin = async (req, res) => {
  const [berths, active] = await Promise.all([
    Berth.find().sort('code').lean(),
    PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } })
      .populate('vessel', 'name imo type loa dwt').populate('berth', 'code').lean(),
  ]);
  const byBerth = new Map(active.filter((c) => c.status === 'BERTHED' && c.berth)
    .map((c) => [String(c.berth.code), c]));
  ok(res, {
    berths: berths.map((b) => {
      const c = byBerth.get(b.code);
      return {
        _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType,
        loaMax: b.loaMax, draftMax: b.draftMax, status: b.status,
        occupiedBy: c ? {
          callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
          type: c.vessel?.type, loa: c.vessel?.loa, atb: c.atb, etd: c.etd,
          cargo: (c.cargoOps || []).map((o) => `${o.operation.toLowerCase()} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
        } : null,
      };
    }),
    anchorage: active.filter((c) => c.status === 'AT_ANCHORAGE').map((c) => ({
      callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, loa: c.vessel?.loa, since: c.ata, etb: c.etb,
    })),
    inbound: active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).map((c) => ({
      callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, loa: c.vessel?.loa, eta: c.eta, status: c.status,
    })).sort((a, b) => new Date(a.eta) - new Date(b.eta)),
  });
};

// Day-wise arrivals / berthings / sailings board around "today".
exports.schedule = async (req, res) => {
  const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 5));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const from = new Date(start.getTime() - 1 * D);
  const to = new Date(start.getTime() + days * D);
  const calls = await PortCall.find({
    $or: [
      { eta: { $gte: from, $lte: to } },
      { etd: { $gte: from, $lte: to } },
      { atd: { $gte: from, $lte: to } },
      { status: 'BERTHED' },
    ],
    status: { $ne: 'CANCELLED' },
  }).populate('vessel', 'name type loa').populate('berth', 'code terminal').lean();

  const events = [];
  for (const c of calls) {
    const base = { callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, berth: c.berth?.code || '—', agent: c.agentName, status: c.status };
    if (['ANNOUNCED', 'CONFIRMED'].includes(c.status) && c.eta) events.push({ ...base, kind: 'ARRIVAL', at: c.eta, planned: true });
    if (c.status === 'AT_ANCHORAGE' && c.etb) events.push({ ...base, kind: 'BERTHING', at: c.etb, planned: true });
    if (c.status === 'BERTHED' && c.etd) events.push({ ...base, kind: 'SAILING', at: c.etd, planned: true });
    if (c.status === 'SAILED' && c.atd && c.atd >= from && c.atd <= to) events.push({ ...base, kind: 'SAILED', at: c.atd, planned: false });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  ok(res, { from, to, events });
};

// Marine resources board
exports.resources = async (req, res) => {
  const rows = await Resource.find().sort('type code').lean();
  ok(res, rows);
};

exports.setResourceStatus = async (req, res) => {
  const doc = await Resource.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Resource not found');
  const { status, currentTask } = req.body || {};
  if (status && !['AVAILABLE', 'TASKED', 'MAINTENANCE', 'OFF_DUTY'].includes(status)) {
    throw new ApiError(400, 'Invalid resource status');
  }
  const before = doc.toObject();
  if (status) doc.status = status;
  doc.currentTask = status === 'TASKED' ? (currentTask || doc.currentTask) : '';
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Resource', entityId: doc._id, entityLabel: `${doc.code} — ${doc.name}`, before, after: doc });
  ok(res, doc);
};
