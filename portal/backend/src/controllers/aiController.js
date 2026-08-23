/* AI assistant — grounded answers over live port data.
 * Deterministic engine always runs (shared with the browser demo); when
 * ANTHROPIC_API_KEY is configured, claude-opus-5 polishes the reply using the
 * engine's findings as grounding context, falling back to the engine on error. */
const path = require('path');
const { Vessel, PortCall, Inspection, Invoice, Instrument, Incident, Berth } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ok, ApiError } = require('../utils/respond');

// Node 22 supports require(ESM) — the engine is shared verbatim with the frontend demo build.
const enginePath = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'ai', 'engine.js');
const { answer, SUGGESTIONS } = require(enginePath);

const HOUR = 3600 * 1000;

function buildAccessors() {
  return {
    kpis: async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const [active, sailedM, invoicesM, inspections, berths] = await Promise.all([
        PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } }).select('status eta').lean(),
        PortCall.find({ status: 'SAILED', atd: { $gte: startMonth } }).select('cargoOps ata atd').lean(),
        Invoice.find({ issuedAt: { $gte: startMonth } }).select('total status').lean(),
        Inspection.find({ status: { $ne: 'CLOSED' } }).select('findings status').lean(),
        Berth.find().lean(),
      ]);
      const berthed = active.filter((c) => c.status === 'BERTHED').length;
      const opBerths = berths.filter((b) => b.status === 'OPERATIONAL').length;
      const sailed30 = await PortCall.find({ status: 'SAILED', atd: { $gte: new Date(now - 30 * 24 * HOUR) } }).select('ata atd').lean();
      const detentionsYTD = await Inspection.countDocuments({ detention: true, closedAt: { $gte: new Date(now.getFullYear(), 0, 1) } });
      return {
        vesselsAtBerth: berthed,
        atAnchorage: active.filter((c) => c.status === 'AT_ANCHORAGE').length,
        expectedArrivals72h: active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status) && new Date(c.eta) > now && new Date(c.eta) < new Date(now.getTime() + 72 * HOUR)).length,
        berthOccupancyPct: opBerths ? Math.round((berthed / opBerths) * 100) : 0,
        cargoMTD: sailedM.reduce((s, c) => s + (c.cargoOps || []).reduce((x, o) => x + (o.qtyMT || 0), 0), 0),
        teuMTD: sailedM.reduce((s, c) => s + (c.cargoOps || []).filter((o) => o.unit === 'TEU').reduce((x, o) => x + o.qty, 0), 0),
        revenueMTD: invoicesM.filter((i) => ['ISSUED', 'PAID'].includes(i.status)).reduce((s, i) => s + i.total, 0),
        avgTurnaroundHrs: sailed30.length ? Math.round(sailed30.reduce((s, c) => s + (new Date(c.atd) - new Date(c.ata)), 0) / sailed30.length / HOUR * 10) / 10 : 0,
        openDeficiencies: inspections.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0),
        openInspections: inspections.length,
        detentionsYTD,
      };
    },
    vesselByName: async (name) => {
      const v = await Vessel.findOne({ name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).lean();
      if (!v) return null;
      const call = await PortCall.findOne({ vessel: v._id, status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } })
        .populate('berth', 'code').lean();
      const certAlertList = (v.certificates || []).map((c) => ({ ...c, st: certStatus(c.expiryDate) })).filter((c) => c.st !== 'VALID');
      let situation = 'No active call — last known from movement history.';
      if (call) {
        situation = call.status === 'BERTHED' ? `Currently **berthed at ${call.berth?.code}** (call ${call.vcn}).`
          : call.status === 'AT_ANCHORAGE' ? `At **anchorage** awaiting berth (call ${call.vcn}).`
            : `Inbound — call ${call.vcn} is ${call.status.toLowerCase()}, ETA ${new Date(call.eta).toISOString().slice(0, 16).replace('T', ' ')}.`;
      }
      return {
        id: v._id, name: v.name, imo: v.imo, type: v.type, flag: v.flag, situation,
        certAlert: certAlertList.length ? `${certAlertList.length} certificate issue(s): ${certAlertList.map((c) => `${c.certType} ${c.st}`).join(', ')}` : '',
      };
    },
    portCallByVcn: async (vcn) => {
      const c = await PortCall.findOne({ vcn }).populate('vessel', 'name').populate('berth', 'code').lean();
      if (!c) return null;
      return {
        id: c._id, vcn: c.vcn, vesselName: c.vessel?.name, status: c.status, berthCode: c.berth?.code,
        eta: c.eta, atb: c.atb, atd: c.atd, agentName: c.agentName,
        cargoSummary: (c.cargoOps || []).map((o) => `${o.operation.toLowerCase()} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
      };
    },
    berthBoard: async () => {
      const [berths, berthedCalls] = await Promise.all([
        Berth.find().sort('code').lean(),
        PortCall.find({ status: 'BERTHED' }).populate('vessel', 'name').lean(),
      ]);
      return berths.map((b) => {
        const c = berthedCalls.find((x) => String(x.berth) === String(b._id));
        return { code: b.code, vessel: c?.vessel?.name, etd: c?.etd };
      });
    },
    arrivals: async () => {
      const calls = await PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE'] } })
        .sort('eta').limit(8).populate('vessel', 'name').lean();
      return calls.map((c) => ({ vcn: c.vcn, vessel: c.vessel?.name, status: c.status, eta: c.eta }));
    },
    expiringCerts: async () => {
      const vessels = await Vessel.find({ status: 'ACTIVE' }).select('name certificates').lean();
      return vessels.flatMap((v) => (v.certificates || [])
        .map((c) => ({ vessel: v.name, certType: c.certType, expiryDate: c.expiryDate, status: certStatus(c.expiryDate) }))
        .filter((c) => c.status !== 'VALID'))
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    },
    riskTop: async (n) => {
      const risk = require('./riskController');
      // reuse compute via a fake res
      let payload;
      await risk.scores({}, { json: (p) => { payload = p; } });
      return payload.data.slice(0, n).map((r) => ({
        name: r.name, score: r.score, band: r.band,
        topFactor: r.factors[0] ? `${r.factors[0].label}: ${r.factors[0].evidence}` : '',
      }));
    },
    openIncidents: async () => {
      const inc = await Incident.find({ status: { $ne: 'CLOSED' } }).sort('-reportedAt').lean();
      return inc.map((i) => ({ number: i.number, type: i.type, severity: i.severity, title: i.title, status: i.status }));
    },
    invoicesSummary: async () => {
      const now = new Date();
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const inv = await Invoice.find().select('total status issuedAt paidAt').lean();
      const outstanding = inv.filter((i) => i.status === 'ISSUED');
      return {
        mtd: inv.filter((i) => i.issuedAt && i.issuedAt >= startMonth && ['ISSUED', 'PAID'].includes(i.status)).reduce((s, i) => s + i.total, 0),
        outstanding: outstanding.reduce((s, i) => s + i.total, 0),
        outstandingCount: outstanding.length,
        drafts: inv.filter((i) => i.status === 'DRAFT').length,
        collectedMtd: inv.filter((i) => i.paidAt && i.paidAt >= startMonth).reduce((s, i) => s + i.total, 0),
      };
    },
    instrumentsLatest: async () => {
      const ins = await Instrument.find({ status: 'IN_FORCE' }).sort('-issuedDate').limit(5).lean();
      return ins.map((i) => ({ refNo: i.refNo, title: i.title, ackRequired: i.ackRequired }));
    },
  };
}

async function polishWithClaude(message, grounded) {
  const aiCfg = require('../config/settingsCache').get('ai', {});
  if (aiCfg.enabled === false || aiCfg.groundedOnly === true) return null;
  const apiKey = aiCfg.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    // eslint-disable-next-line global-require
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: aiCfg.model || 'claude-opus-5',
      max_tokens: 1024,
      system: 'You are the Mundra Port operations assistant inside a port management system. '
        + 'Answer ONLY from the grounded facts provided — never invent vessels, numbers or records. '
        + 'Be concise and operational. Keep any markdown links from the grounding.',
      messages: [{
        role: 'user',
        content: `Grounded facts from the live system:\n${grounded.reply}\n\nUser question: ${message}\n\nAnswer the question from these facts.`,
      }],
    });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return text || null;
  } catch (e) {
    console.error('Claude polish failed, using engine reply:', e.message);
    return null;
  }
}

exports.chat = async (req, res) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) throw new ApiError(400, 'Say something first');
  const grounded = await answer({ message, data: buildAccessors() });
  const polished = await polishWithClaude(message, grounded);
  ok(res, {
    reply: polished || grounded.reply,
    sources: grounded.sources,
    suggestions: grounded.suggestions || SUGGESTIONS,
    engine: polished ? 'claude-opus-5 (grounded)' : 'deterministic (grounded)',
  });
};

exports.suggestions = async (_req, res) => ok(res, SUGGESTIONS);
