/* Entity hover-cards — compact people/asset summaries shown on hover anywhere
 * in the UI (the Teams-style card). One endpoint, one shape per type. */
const { User, Vessel, Seafarer, Berth, Lookup, Incident, PortCall } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok } = require('../utils/respond');

const ACTIVE = ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'];

const TYPES = {
  user: async (id) => {
    const u = await User.findById(id).populate('role', 'name').lean();
    if (!u) return null;
    return {
      kind: 'user', title: u.name, subtitle: u.designation || u.role?.name || '',
      lines: [
        { label: 'Role', value: u.role?.name || '—' },
        { label: 'Email', value: u.email },
        { label: 'Phone', value: u.phone || '—' },
        { label: 'Last sign-in', value: u.lastLoginAt || null, kind: 'since' },
      ],
      chips: [{ label: u.active === false ? 'Disabled' : 'Active', tone: u.active === false ? 'default' : 'success' }],
    };
  },
  vessel: async (id) => {
    const v = await Vessel.findById(id).lean();
    if (!v) return null;
    const call = await PortCall.findOne({ vessel: v._id, status: { $in: ACTIVE } }).populate('berth', 'code').lean();
    const alerts = (v.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length;
    const situation = !call ? 'No active call'
      : call.status === 'BERTHED' ? `Berthed at ${call.berth?.code || '—'} (${call.vcn})`
        : call.status === 'AT_ANCHORAGE' ? `At anchorage (${call.vcn})`
          : `Inbound — ${call.status.toLowerCase()} (${call.vcn})`;
    return {
      kind: 'vessel', title: v.name, subtitle: `IMO ${v.imo} · ${v.type} · ${v.flag} flag`, link: `/vessels/${v._id}`,
      lines: [
        { label: 'Now', value: situation },
        { label: 'Owner', value: v.owner || '—' },
        { label: 'Agent', value: v.agent || '—' },
        { label: 'DWT / LOA', value: `${new Intl.NumberFormat('en-IN').format(v.dwt || 0)} MT · ${v.loa || '—'} m` },
      ],
      chips: [
        { label: v.status, tone: v.status === 'ACTIVE' ? 'success' : 'default' },
        ...(alerts ? [{ label: `${alerts} cert alert${alerts > 1 ? 's' : ''}`, tone: 'warning' }] : []),
      ],
    };
  },
  seafarer: async (id) => {
    const s = await Seafarer.findById(id).populate('currentVessel', 'name').lean();
    if (!s) return null;
    const alerts = (s.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length;
    return {
      kind: 'seafarer', title: s.name, subtitle: `${s.rank} · CDC ${s.cdcNo}`, link: `/seafarers/${s._id}`,
      lines: [
        { label: 'On board', value: s.currentVessel?.name || 'Ashore' },
        { label: 'Nationality', value: s.nationality },
        { label: 'INDoS', value: s.indosNo || '—' },
        { label: 'Phone', value: s.phone || '—' },
      ],
      chips: [
        { label: s.status.replace(/_/g, ' '), tone: s.status === 'ACTIVE' ? 'success' : 'default' },
        ...(alerts ? [{ label: `${alerts} cert alert${alerts > 1 ? 's' : ''}`, tone: 'warning' }] : []),
      ],
    };
  },
  berth: async (id) => {
    const b = await Berth.findById(id).lean();
    if (!b) return null;
    const call = await PortCall.findOne({ berth: b._id, status: 'BERTHED' }).populate('vessel', 'name').lean();
    return {
      kind: 'berth', title: `${b.code} — ${b.name}`, subtitle: b.terminal,
      lines: [
        { label: 'Type', value: b.berthType },
        { label: 'Max LOA / draft', value: `${b.loaMax || '—'} m · ${b.draftMax || '—'} m` },
        { label: 'Alongside', value: call ? `${call.vessel?.name} (${call.vcn})` : 'Free' },
      ],
      chips: [
        { label: b.status, tone: b.status === 'OPERATIONAL' ? 'success' : 'warning' },
        { label: call ? 'Occupied' : 'Free', tone: call ? 'info' : 'default' },
      ],
    };
  },
  agent: async (code) => {
    const a = await Lookup.findOne({ category: 'agent', code: String(code).toUpperCase() }).lean();
    if (!a) return null;
    const activeCalls = await PortCall.countDocuments({ agentCode: a.code, status: { $in: ACTIVE } });
    return {
      kind: 'agent', title: a.label, subtitle: `Shipping agent · ${a.code}`,
      lines: [
        { label: 'Address', value: a.meta?.address || '—' },
        { label: 'GSTIN', value: a.meta?.gstin || '—' },
        { label: 'Active calls', value: String(activeCalls) },
      ],
      chips: [{ label: 'Licensed', tone: 'success' }],
    };
  },
  incident: async (id) => {
    const i = await Incident.findById(id).select('number title type severity status reportedAt assignedTo').lean();
    if (!i) return null;
    return {
      kind: 'incident', title: i.number, subtitle: i.title, link: `/incidents/${i._id}`,
      lines: [
        { label: 'Type', value: i.type.replace(/_/g, ' ') },
        { label: 'Case officer', value: i.assignedTo?.name || 'Unassigned' },
        { label: 'Reported', value: i.reportedAt, kind: 'since' },
      ],
      chips: [
        { label: i.severity, tone: ['HIGH', 'CRITICAL'].includes(i.severity) ? 'error' : i.severity === 'MEDIUM' ? 'warning' : 'default' },
        { label: i.status.replace(/_/g, ' '), tone: ['RESOLVED', 'CLOSED'].includes(i.status) ? 'success' : 'info' },
      ],
    };
  },
};

exports.get = async (req, res) => {
  const fn = TYPES[req.params.type];
  if (!fn) throw new ApiError(404, `Unknown card type "${req.params.type}"`);
  const card = await fn(req.params.id).catch(() => null);
  if (!card) throw new ApiError(404, 'Record not found');
  ok(res, card);
};
