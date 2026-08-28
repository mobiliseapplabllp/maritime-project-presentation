// Global search — one query across every register the signed-in role can see.
// Powers the Ctrl+K command palette; each hit carries the route to jump to.
const { Vessel, PortCall, Seafarer, Company, Incident, Invoice, User, Instrument, License } = require('../models');
const { hasPerm } = require('../domain/rbac');
const { escapeRegex } = require('../utils/paginate');
const { ok } = require('../utils/respond');

const LIMIT = 5;

exports.global = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return ok(res, { groups: [] });
  const rx = { $regex: escapeRegex(q), $options: 'i' };
  const can = (p) => hasPerm(req.user.perms, p);

  const jobs = [];
  const add = (perm, type, label, promise, map) => {
    if (!can(perm)) return;
    jobs.push(promise.then((docs) => ({ type, label, items: docs.map(map) })));
  };

  add('vessels.view', 'vessel', 'Vessels',
    Vessel.find({ $or: [{ name: rx }, { imo: rx }, { callSign: rx }] }).limit(LIMIT).select('name imo type flag').lean(),
    (v) => ({ id: v._id, label: v.name, sub: `IMO ${v.imo} · ${v.type}`, to: `/vessels/${v._id}` }));
  add('portcalls.view', 'call', 'Port calls',
    PortCall.find({ vcn: rx }).sort('-eta').limit(LIMIT).populate('vessel', 'name').lean(),
    (c) => ({ id: c._id, label: c.vcn, sub: `${c.vessel ? c.vessel.name : ''} · ${c.status}`, to: `/port-calls/${c._id}` }));
  add('seafarers.view', 'seafarer', 'Seafarers',
    Seafarer.find({ $or: [{ name: rx }, { cdcNo: rx }, { indosNo: rx }] }).limit(LIMIT).select('name rank cdcNo').lean(),
    (s) => ({ id: s._id, label: s.name, sub: `${s.rank} · CDC ${s.cdcNo}`, to: `/seafarers/${s._id}` }));
  add('facilities.view', 'company', 'Companies',
    Company.find({ $or: [{ name: rx }, { code: rx }] }).limit(LIMIT).select('name code category').lean(),
    (c) => ({ id: c._id, label: c.name, sub: `${c.code} · ${String(c.category || '').replace(/_/g, ' ')}`, to: `/companies/${c._id}` }));
  add('incidents.view', 'incident', 'Incidents',
    Incident.find({ $or: [{ number: rx }, { title: rx }] }).sort('-reportedAt').limit(LIMIT).select('number title severity status').lean(),
    (i) => ({ id: i._id, label: `${i.number} — ${i.title}`, sub: `${i.severity} · ${i.status}`, to: `/incidents/${i._id}` }));
  add('invoices.view', 'invoice', 'Invoices',
    Invoice.find({ number: rx }).sort('-createdAt').limit(LIMIT).select('number total status').lean(),
    (i) => ({ id: i._id, label: i.number, sub: `₹${Number(i.total || 0).toLocaleString('en-IN')} · ${i.status}`, to: `/invoices/${i._id}` }));
  add('legislation.view', 'notice', 'Notices & circulars',
    Instrument.find({ $or: [{ refNo: rx }, { title: rx }] }).sort('-issuedDate').limit(LIMIT).select('refNo title status').lean(),
    (n) => ({ id: n._id, label: `${n.refNo} — ${n.title}`, sub: n.status, to: '/legislation' }));
  add('facilities.view', 'licence', 'Licences',
    License.find({ $or: [{ licenseNo: rx }, { entityName: rx }] }).limit(LIMIT).select('licenseNo entityName status').lean(),
    (l) => ({ id: l._id, label: l.licenseNo, sub: `${l.entityName} · ${l.status}`, to: '/facilities' }));
  add('users.view', 'user', 'Users',
    User.find({ $or: [{ name: rx }, { email: rx }] }).limit(LIMIT).select('name email designation').lean(),
    (u) => ({ id: u._id, label: u.name, sub: `${u.designation || ''} · ${u.email}`, to: '/admin/users' }));

  const groups = (await Promise.all(jobs)).filter((g) => g.items.length);
  ok(res, { groups, q });
};
