const { Invoice, PortCall, TariffItem, Lookup, Setting, Notification } = require('../models');
const { buildInvoiceLines, computeTotals } = require('../domain/invoiceMath');
const { GST_RATE } = require('../config/constants');
const settings = require('../config/settingsCache');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-createdAt' });
  const filter = {};
  for (const f of ['status', 'vessel']) if (req.query[f]) filter[f] = req.query[f];
  const search = searchFilter(req.query.q, ['number']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    Invoice.find(filter).sort(sort).skip(skip).limit(limit)
      .populate('vessel', 'name imo').populate('portCall', 'vcn'),
    Invoice.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await Invoice.findById(req.params.id)
    .populate('vessel', 'name imo flag grt').populate('portCall', 'vcn eta atd agentName');
  if (!doc) throw new ApiError(404, 'Invoice not found');
  ok(res, doc);
};

exports.generate = async (req, res) => {
  const { portCallId } = req.body || {};
  if (!portCallId) throw new ApiError(400, 'portCallId is required');
  const call = await PortCall.findById(portCallId).populate('vessel');
  if (!call) throw new ApiError(404, 'Port call not found');
  const existing = await Invoice.findOne({ portCall: call._id, status: { $ne: 'CANCELLED' } });
  if (existing) throw new ApiError(409, `Invoice ${existing.number} already exists for call ${call.vcn}`);
  const tariffDocs = await TariffItem.find({ active: true }).lean();
  const tariffs = Object.fromEntries(tariffDocs.map((t) => [t.code, t]));
  const rawLines = buildInvoiceLines(call, tariffs);
  if (!rawLines.length) throw new ApiError(400, 'Nothing to bill on this call yet — add services or cargo operations first');
  const gstRate = Number(settings.get('billing', {}).gstRate) || GST_RATE;
  const totals = computeTotals(rawLines, gstRate);
  const agent = call.agentCode ? await Lookup.findOne({ category: 'agent', code: call.agentCode }).lean() : null;
  const doc = await Invoice.create({
    number: await nextNumber(Invoice, 'number', `${settings.moduleGet('finance').invoicePrefix || 'MUN/INV'}/${new Date().getFullYear()}/`),
    portCall: call._id, vessel: call.vessel._id,
    billTo: {
      name: call.agentName || (agent && agent.label) || 'Master / Owners',
      address: (agent && agent.meta && agent.meta.address) || 'Mundra, Kutch, Gujarat',
      gstin: (agent && agent.meta && agent.meta.gstin) || '',
    },
    lines: totals.lines, subtotal: totals.subtotal,
    gstRate, gstAmount: totals.gstAmount, total: totals.total,
  });
  audit(req, { action: 'CREATE', entity: 'Invoice', entityId: doc._id, entityLabel: `${doc.number} (${call.vcn})`, after: doc });
  created(res, doc);
};

exports.update = async (req, res) => {
  const doc = await Invoice.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Invoice not found');
  if (doc.status !== 'DRAFT') throw new ApiError(400, 'Only draft invoices can be edited');
  const before = doc.toObject();
  if (Array.isArray(req.body.lines)) {
    const clean = req.body.lines.filter((l) => l.description && l.qty > 0 && l.rate >= 0);
    if (!clean.length) throw new ApiError(400, 'An invoice needs at least one line');
    const totals = computeTotals(clean, doc.gstRate);
    doc.lines = totals.lines;
    doc.subtotal = totals.subtotal; doc.gstAmount = totals.gstAmount; doc.total = totals.total;
  }
  if (req.body.notes !== undefined) doc.notes = req.body.notes;
  if (req.body.billTo !== undefined) doc.billTo = { ...doc.billTo, ...req.body.billTo };
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Invoice', entityId: doc._id, entityLabel: doc.number, before, after: doc });
  ok(res, doc);
};

exports.issue = async (req, res) => {
  const doc = await Invoice.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Invoice not found');
  if (doc.status !== 'DRAFT') throw new ApiError(409, `A ${doc.status.toLowerCase()} invoice cannot be issued`);
  doc.status = 'ISSUED'; doc.issuedAt = new Date();
  await doc.save();
  audit(req, { action: 'ISSUE', entity: 'Invoice', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};

exports.pay = async (req, res) => {
  const doc = await Invoice.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Invoice not found');
  if (doc.status !== 'ISSUED') throw new ApiError(409, 'Only an issued invoice can be marked paid');
  doc.status = 'PAID'; doc.paidAt = new Date(); doc.paymentRef = (req.body || {}).paymentRef || '';
  await doc.save();
  audit(req, { action: 'PAY', entity: 'Invoice', entityId: doc._id, entityLabel: `${doc.number} — ${doc.paymentRef || 'no ref'}` });
  ok(res, doc);
};

exports.cancel = async (req, res) => {
  const doc = await Invoice.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Invoice not found');
  if (doc.status === 'PAID') throw new ApiError(409, 'A paid invoice cannot be cancelled');
  doc.status = 'CANCELLED';
  await doc.save();
  audit(req, { action: 'CANCEL', entity: 'Invoice', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};

exports.remove = async (req, res) => {
  const doc = await Invoice.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Invoice not found');
  if (doc.status !== 'DRAFT') throw new ApiError(400, 'Only draft invoices can be deleted');
  await doc.deleteOne();
  audit(req, { action: 'DELETE', entity: 'Invoice', entityId: doc._id, entityLabel: doc.number, before: doc });
  ok(res, { deleted: true });
};
