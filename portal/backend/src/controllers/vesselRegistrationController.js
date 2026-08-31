/* B1 — the Registrar of Indian Ships, as a service.
 *
 * The rules live in domain/vesselRegistry; this decides who may do what, goes
 * and gets the two facts the rules cannot know for themselves, and writes the
 * result back onto the ship. The one thing worth reading closely is grant():
 * that is the moment a ship acquires — or loses — its nationality, and it is
 * the only place in the platform allowed to write Vessel.registry. */
const { VesselRegistration, Vessel, Invoice, Notification } = require('../models');
const { REGISTRATION_TRANSITIONS, REGISTRATION_KINDS } = require('../config/constants');
const { getProfile } = require('../config/jurisdictions');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');
const R = require('../domain/vesselRegistry');

const D = 86400000;

// How long the registry gives itself, and what it charges. A first registration
// is a longer piece of work than a change of manager, and the fee follows.
const SLA_DAYS = { PERMANENT: 30, PROVISIONAL: 7, AMENDMENT: 15, DELETION: 15 };
const FEES = { PERMANENT: 50000, PROVISIONAL: 15000, AMENDMENT: 10000, DELETION: 5000 };
const CERT_SERIES = { PERMANENT: 'CR', PROVISIONAL: 'PCR', AMENDMENT: 'CR', DELETION: 'DEL' };

const kindLabel = (k) => String(k || '').replace(/_/g, ' ').toLowerCase();

/** Everything the registrar has to look up rather than read off the file. */
async function contextFor(doc) {
  const [onRegister, unpaid] = await Promise.all([
    VesselRegistration.exists({
      vessel: doc.vessel,
      kind: { $in: ['PERMANENT', 'PROVISIONAL'] },
      status: 'GRANTED',
      _id: { $ne: doc._id },
    }),
    Invoice.find({ vessel: doc.vessel, status: 'ISSUED' }).select('total currency').lean(),
  ]);
  // A closed entry is not a subsisting one — a ship that has left the register
  // may come back onto it.
  const vessel = await Vessel.findById(doc.vessel).lean();
  const state = (vessel && vessel.registry && vessel.registry.state) || 'UNREGISTERED';
  const closed = state === 'CLOSED';
  // A ship on a provisional certificate is not "already registered" for the
  // purpose of its permanent registration — the provisional entry exists to be
  // superseded by exactly this application.
  const bridging = doc.kind === 'PERMANENT' && state === 'PROVISIONAL';
  return {
    vessel,
    bridging,
    onRegister: !!onRegister && !closed && !bridging,
    outstandingDues: unpaid.reduce((s, i) => s + (i.total || 0), 0),
    currency: (unpaid[0] && unpaid[0].currency) || 'INR',
  };
}

/* Allocate the official number.
 *
 * The number is the ship's for the life of the entry, so a permanent
 * registration bridging from a provisional one inherits it rather than taking a
 * fresh one: a ship whose official number changed halfway through its first year
 * on the flag would be a ship nobody could trace back. */
async function allocateOfficialNumber(doc, by) {
  if (doc.officialNumber) return doc.officialNumber;
  const vessel = await Vessel.findById(doc.vessel).select('registry').lean();
  const r = (vessel && vessel.registry) || {};
  if (doc.kind === 'PERMANENT' && r.state === 'PROVISIONAL' && r.officialNumber) {
    await VesselRegistration.updateOne(
      { vessel: doc.vessel, kind: 'PROVISIONAL', status: 'GRANTED' },
      { $push: { history: { from: 'GRANTED', to: 'GRANTED', at: new Date(), by, note: `Superseded by ${doc.applicationNo}` } } },
    );
    return r.officialNumber;
  }
  return R.nextOfficialNumber(VesselRegistration);
}

async function runChecks(doc) {
  const ctx = await contextFor(doc);
  const checks = R.registrationChecks(doc, ctx.vessel, ctx, undefined);
  return { checks, blocked: R.blocking(checks), ctx };
}

/* ------------------------------------------------------------ reference --- */

/** What a registration form needs to render: ports, share rules, evidence. */
exports.reference = (_req, res) => {
  const p = getProfile();
  ok(res, {
    registrar: p.registry.registrar,
    statute: p.registry.statute,
    nationalityRule: p.registry.nationalityRule,
    portsOfRegistry: R.portsOfRegistry(),
    defaultPort: R.defaultPort(),
    shareRules: R.shareRules(),
    kinds: REGISTRATION_KINDS.map((k) => ({
      kind: k, slaDays: SLA_DAYS[k], fee: FEES[k], currency: 'INR',
      evidence: R.EVIDENCE[k],
    })),
    provisionalValidityMonths: p.registry.provisionalValidityMonths.value,
  });
};

/* ----------------------------------------------------------- the register --- */

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-createdAt' });
  const filter = {};
  for (const f of ['status', 'kind', 'portOfRegistry', 'assignedTo']) if (req.query[f]) filter[f] = req.query[f];
  if (req.query.vessel) filter.vessel = req.query.vessel;
  if (req.query.open === 'true') {
    filter.status = { $in: ['SUBMITTED', 'UNDER_SCRUTINY', 'CARVING_NOTE_ISSUED', 'SURVEY_COMPLETE', 'APPROVED'] };
  }
  if (req.query.breached === 'true') { filter.closedAt = null; filter.dueAt = { $lt: new Date() }; }
  const search = searchFilter(req.query.q, ['applicationNo', 'vesselName', 'imo', 'officialNumber', 'applicant.name']);
  if (search) Object.assign(filter, search);
  const [rows, total] = await Promise.all([
    VesselRegistration.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    VesselRegistration.countDocuments(filter),
  ]);
  const now = new Date();
  ok(res, rows.map((r) => ({
    ...r,
    portOfRegistryName: r.portOfRegistryName || R.portName(r.portOfRegistry),
    slaBreached: !!(r.dueAt && !r.closedAt && new Date(r.dueAt) < now),
  })), { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, 'Registration not found');
  const vessel = await Vessel.findById(doc.vessel).select('name imo flag grt type registry status').lean();
  ok(res, {
    ...doc,
    vessel,
    portOfRegistryName: doc.portOfRegistryName || R.portName(doc.portOfRegistry),
    requiredEvidence: R.requiredEvidence(doc),
    shareLedger: R.shareLedger(doc.owners),
    slaBreached: !!(doc.dueAt && !doc.closedAt && new Date(doc.dueAt) < new Date()),
  });
};

/** Every registry transaction against one ship, newest first. */
exports.forVessel = async (req, res) => {
  const rows = await VesselRegistration.find({ vessel: req.params.id }).sort({ createdAt: -1 }).lean();
  ok(res, rows, { total: rows.length });
};

/** Dry-run the statutory checks. An officer sees what will block before deciding. */
exports.checks = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const { checks, blocked } = await runChecks(doc);
  ok(res, { applicationNo: doc.applicationNo, kind: doc.kind, checks, blocked });
};

/* --------------------------------------------------------------- lodging --- */

exports.apply = async (req, res) => {
  const b = req.body || {};
  if (!REGISTRATION_KINDS.includes(b.kind)) throw new ApiError(400, 'A valid registration type is required');
  if (!b.vessel) throw new ApiError(400, 'A vessel is required');
  const vessel = await Vessel.findById(b.vessel).lean();
  if (!vessel) throw new ApiError(404, 'No vessel found for this application');

  const port = String(b.portOfRegistry || R.defaultPort()).toUpperCase();
  if (!R.isKnownPort(port)) throw new ApiError(400, `${port} is not a declared port of registry`);

  // One open application per ship per journey — a second one would fork the file.
  const openOne = await VesselRegistration.findOne({
    vessel: b.vessel, kind: b.kind,
    status: { $nin: ['GRANTED', 'REJECTED', 'WITHDRAWN'] },
  }).select('applicationNo').lean();
  if (openOne) throw new ApiError(409, `${openOne.applicationNo} is already open for this ship`);

  /* The ship's standing on the register decides which journeys are even
   * available to it. The assessment checks test the same fact, but refusing at
   * the counter is better than accepting an application that can never be
   * granted and telling the applicant weeks later. */
  const onRegister = ['REGISTERED', 'PROVISIONAL'].includes((vessel.registry || {}).state);
  if (['PERMANENT', 'PROVISIONAL'].includes(b.kind) && onRegister) {
    // The one exception: a ship on a provisional certificate is expected to come
    // back for its permanent one — that is what a provisional certificate is for.
    const bridging = b.kind === 'PERMANENT' && vessel.registry.state === 'PROVISIONAL';
    if (!bridging) {
      throw new ApiError(409, `${vessel.name} already holds a registry entry — official number ${vessel.registry.officialNumber}`);
    }
  }
  if (['AMENDMENT', 'DELETION'].includes(b.kind) && !onRegister) {
    throw new ApiError(409, `${vessel.name} is not on the register, so there is nothing to ${b.kind === 'DELETION' ? 'close' : 'alter'}`);
  }

  const now = new Date();
  const isDraft = b.draft === true;
  const doc = await VesselRegistration.create({
    applicationNo: await nextNumber(VesselRegistration, 'applicationNo', `REG-${now.getFullYear()}-`, 5),
    kind: b.kind,
    vessel: vessel._id,
    vesselName: b.vesselName || vessel.name,
    imo: vessel.imo,
    portOfRegistry: port,
    portOfRegistryName: R.portName(port),
    applicant: {
      name: b.applicantName || req.user.name,
      email: b.applicantEmail || req.user.email || '',
      phone: b.applicantPhone || '',
      capacity: b.capacity || 'Owner',
    },
    owners: b.owners || [],
    tonnage: b.tonnage || {},
    previousFlag: b.previousFlag || '',
    previousRegistry: b.previousRegistry || '',
    previousOfficialNumber: b.previousOfficialNumber || '',
    evidence: b.evidence || [],
    encumbrances: b.encumbrances || [],
    amendment: b.amendment || {},
    deletion: b.deletion || {},
    fee: { amount: FEES[b.kind] || 0, currency: 'INR', paid: false },
    status: isDraft ? 'DRAFT' : 'SUBMITTED',
    submittedAt: isDraft ? undefined : now,
    dueAt: isDraft ? undefined : new Date(now.getTime() + (SLA_DAYS[b.kind] || 30) * D),
    history: [{ from: '', to: isDraft ? 'DRAFT' : 'SUBMITTED', at: now, by: req.user.name, note: `${kindLabel(b.kind)} registration lodged` }],
  });
  audit(req, { action: 'CREATE', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${doc.vesselName} (${kindLabel(doc.kind)})` });
  created(res, doc);
};

/** Amend a file that has not yet been decided. */
exports.update = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  if (['GRANTED', 'REJECTED', 'WITHDRAWN'].includes(doc.status)) {
    throw new ApiError(409, `A ${doc.status.toLowerCase()} application cannot be edited`);
  }
  const b = req.body || {};
  for (const f of ['owners', 'tonnage', 'previousFlag', 'previousRegistry', 'previousOfficialNumber',
    'amendment', 'deletion', 'assignedTo', 'vesselName']) {
    if (b[f] !== undefined) doc[f] = b[f];
  }
  if (b.portOfRegistry) {
    const port = String(b.portOfRegistry).toUpperCase();
    if (!R.isKnownPort(port)) throw new ApiError(400, `${port} is not a declared port of registry`);
    doc.portOfRegistry = port;
    doc.portOfRegistryName = R.portName(port);
  }
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'VesselRegistration', entityId: doc._id, entityLabel: doc.applicationNo });
  ok(res, doc);
};

/* -------------------------------------------------------------- evidence --- */

exports.addEvidence = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const { key, label, reference, issuedBy, issuedOn, fileName } = req.body || {};
  if (!key) throw new ApiError(400, 'A document key is required');
  doc.evidence.push({ key, label: label || '', reference: reference || '', issuedBy: issuedBy || '', issuedOn, fileName: fileName || '' });
  await doc.save();
  audit(req, { action: 'DOC_ADD', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${key}` });
  created(res, doc);
};

exports.verifyEvidence = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const item = doc.evidence.id(req.params.evidenceId);
  if (!item) throw new ApiError(404, 'Document not found on this application');
  item.verified = req.body.verified !== false;
  item.verifiedBy = req.user.name;
  item.verifiedAt = new Date();
  await doc.save();
  audit(req, { action: 'DOC_VERIFY', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${item.key}` });
  ok(res, doc);
};

/* ---------------------------------------------------------- encumbrances --- */

exports.addEncumbrance = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const { kind, holder, amount, currency, registeredOn, reference } = req.body || {};
  if (!holder) throw new ApiError(400, 'The holder of the charge is required');
  doc.encumbrances.push({ kind: kind || 'MORTGAGE', holder, amount: amount || 0, currency: currency || 'INR', registeredOn: registeredOn || new Date(), reference: reference || '' });
  await doc.save();
  audit(req, { action: 'ENCUMBRANCE_ADD', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${holder}` });
  created(res, doc);
};

exports.dischargeEncumbrance = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const item = doc.encumbrances.id(req.params.encumbranceId);
  if (!item) throw new ApiError(404, 'Charge not found on this application');
  if (item.dischargedOn) throw new ApiError(409, 'This charge is already discharged');
  item.dischargedOn = req.body.dischargedOn ? new Date(req.body.dischargedOn) : new Date();
  await doc.save();
  audit(req, { action: 'ENCUMBRANCE_DISCHARGE', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${item.holder}` });
  ok(res, doc);
};

/* ------------------------------------------------------------- lifecycle --- */

exports.transition = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  const { to, note, override } = req.body || {};
  if (to === 'GRANTED') throw new ApiError(400, 'Use the grant endpoint — a grant writes the register');

  const allowed = REGISTRATION_TRANSITIONS[doc.status] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(409, `A ${doc.status.replace(/_/g, ' ').toLowerCase()} application cannot move to ${String(to || '').replace(/_/g, ' ').toLowerCase()}`);
  }
  if (['REJECTED'].includes(to) && !note) throw new ApiError(400, 'A reason is required to refuse an application');

  // Only a first registration is carved and surveyed.
  if (['CARVING_NOTE_ISSUED', 'SURVEY_COMPLETE'].includes(to) && doc.kind !== 'PERMANENT') {
    throw new ApiError(409, `A ${kindLabel(doc.kind)} application is not carved or surveyed`);
  }
  if (to === 'SURVEY_COMPLETE' && !(doc.carvingNote && doc.carvingNote.compliedOn)) {
    throw new ApiError(409, 'Record the surveyor\'s compliance report before closing the survey');
  }

  const from = doc.status;
  const now = new Date();

  /* The official number is allocated with the carving note, not with the
   * certificate: the number has to exist before it can be cut into the beam,
   * and once cut it is the ship's for the life of the entry. */
  if (to === 'CARVING_NOTE_ISSUED') {
    doc.officialNumber = await allocateOfficialNumber(doc, req.user.name);
    doc.carvingNote = {
      ...(doc.carvingNote ? doc.carvingNote.toObject() : {}),
      number: doc.carvingNote && doc.carvingNote.number
        ? doc.carvingNote.number
        : await nextNumber(VesselRegistration, 'carvingNote.number', `${doc.portOfRegistry}/CMN/${now.getFullYear()}/`),
      issuedOn: now,
      issuedBy: req.user.name,
    };
  }

  if (to === 'APPROVED') {
    const { checks, blocked } = await runChecks(doc);
    if (blocked.length && !override) {
      throw new ApiError(409, `Cannot approve — ${blocked.map((c) => c.detail).join('; ')}`);
    }
    if (blocked.length && override && !note) throw new ApiError(400, 'An override requires a written reason');
    doc.checks = checks;
    if (blocked.length && override) {
      doc.checks.push({ check: 'Registrar override', passed: true, blocking: false, detail: note });
    }
  }

  if (to === 'SUBMITTED' && !doc.submittedAt) {
    doc.submittedAt = now;
    doc.dueAt = new Date(now.getTime() + (SLA_DAYS[doc.kind] || 30) * D);
  }
  if (to === 'REJECTED') {
    doc.decision = { outcome: 'REJECTED', by: req.user.name, at: now, reason: note };
    doc.closedAt = now;
  }
  if (to === 'WITHDRAWN') doc.closedAt = now;
  if (to === 'UNDER_SCRUTINY' && !doc.assignedTo) doc.assignedTo = req.user.name;

  doc.status = to;
  doc.history.push({ from, to, at: now, by: req.user.name, note: note || '' });
  await doc.save();
  audit(req, { action: 'TRANSITION', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo}: ${from} → ${to}` });
  ok(res, doc);
};

/** The surveyor reports that the official number and tonnage are cut into the ship. */
exports.carvingCompliance = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  if (doc.status !== 'CARVING_NOTE_ISSUED') throw new ApiError(409, 'No carving note is outstanding on this application');
  const { surveyor, compliedOn, remarks } = req.body || {};
  if (!surveyor) throw new ApiError(400, 'The reporting surveyor must be named');
  doc.carvingNote.compliedOn = compliedOn ? new Date(compliedOn) : new Date();
  doc.carvingNote.surveyor = surveyor;
  doc.carvingNote.remarks = remarks || '';
  doc.history.push({ from: doc.status, to: doc.status, at: new Date(), by: req.user.name, note: `Carving and marking reported complied by ${surveyor}` });
  await doc.save();
  audit(req, { action: 'CARVING_COMPLIED', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} — ${surveyor}` });
  ok(res, doc);
};

/* ----------------------------------------------------------------- grant --- */

/* The register is written here and nowhere else.
 *
 * Whatever the journey, the same three things happen: the application is closed
 * with a certificate number, the ship's registry block is brought into line with
 * what was granted, and — where the entry is being closed — the ship comes off
 * the register. Doing it in one place is what keeps the ship record and the
 * register from ever disagreeing. */
exports.grant = async (req, res) => {
  const doc = await VesselRegistration.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Registration not found');
  if (doc.status !== 'APPROVED') throw new ApiError(409, 'Only an approved application can be granted');

  const vessel = await Vessel.findById(doc.vessel);
  if (!vessel) throw new ApiError(404, 'The vessel record for this application no longer exists');

  const now = new Date();
  const p = getProfile();
  const series = CERT_SERIES[doc.kind];
  doc.certificateNo = await nextNumber(VesselRegistration, 'certificateNo', `${doc.portOfRegistry}/${series}/${now.getFullYear()}/`);

  if (doc.kind === 'PERMANENT' || doc.kind === 'PROVISIONAL') {
    doc.officialNumber = await allocateOfficialNumber(doc, req.user.name);
    const provisional = doc.kind === 'PROVISIONAL';
    if (provisional) {
      doc.certificateExpiresOn = new Date(now.getTime() + p.registry.provisionalValidityMonths.value * 30.44 * D);
    }
    vessel.registry = {
      state: provisional ? 'PROVISIONAL' : 'REGISTERED',
      officialNumber: doc.officialNumber,
      portOfRegistry: doc.portOfRegistry,
      certificateNo: doc.certificateNo,
      registeredOn: now,
      certificateExpiresOn: provisional ? doc.certificateExpiresOn : undefined,
      closedOn: undefined,
      closureReason: '',
    };
    vessel.portOfRegistry = R.portName(doc.portOfRegistry);
    vessel.flag = 'India';
    if (doc.tonnage && doc.tonnage.gross) vessel.grt = doc.tonnage.gross;
  }

  if (doc.kind === 'AMENDMENT') {
    const types = (doc.amendment && doc.amendment.types) || [];
    const after = (doc.amendment && doc.amendment.after) || {};
    // Record what the entry looked like before the alteration, so the transcript
    // reads as a history rather than only a current state.
    doc.amendment.before = {
      name: vessel.name, portOfRegistry: vessel.registry.portOfRegistry,
      grt: vessel.grt, owner: vessel.owner, manager: vessel.manager,
    };
    if (types.includes('NAME') && after.name) { vessel.name = after.name; doc.vesselName = after.name; }
    if (types.includes('PORT_OF_REGISTRY') && after.portOfRegistry) {
      const port = String(after.portOfRegistry).toUpperCase();
      if (!R.isKnownPort(port)) throw new ApiError(400, `${port} is not a declared port of registry`);
      vessel.registry.portOfRegistry = port;
      vessel.portOfRegistry = R.portName(port);
    }
    if (types.includes('TONNAGE') && after.grt) vessel.grt = after.grt;
    if (types.includes('OWNERSHIP') && after.owner) vessel.owner = after.owner;
    if (types.includes('MANAGER') && after.manager) vessel.manager = after.manager;
    vessel.registry.certificateNo = doc.certificateNo;    // the certificate is reissued as altered
    doc.markModified('amendment');
  }

  if (doc.kind === 'DELETION') {
    doc.deletion.certificateNo = doc.certificateNo;
    doc.deletion.issuedOn = now;
    doc.deletion.effectiveOn = doc.deletion.effectiveOn || now;
    vessel.registry.state = 'CLOSED';
    vessel.registry.closedOn = doc.deletion.effectiveOn;
    vessel.registry.closureReason = doc.deletion.reason;
    if (doc.deletion.newFlag) vessel.flag = doc.deletion.newFlag;
    // A ship off the register is no longer an Indian ship; it stays on the fleet
    // record as history but stops being operationally live.
    vessel.status = 'INACTIVE';
    doc.markModified('deletion');
  }

  doc.status = 'GRANTED';
  doc.grantedOn = now;
  doc.grantedBy = req.user.name;
  doc.closedAt = now;
  doc.decision = { outcome: 'GRANTED', by: req.user.name, at: now, reason: req.body.note || '' };
  doc.history.push({ from: 'APPROVED', to: 'GRANTED', at: now, by: req.user.name, note: `${doc.certificateNo} issued` });

  await Promise.all([doc.save(), vessel.save()]);

  Notification.create({
    title: doc.kind === 'DELETION'
      ? `Registry closed — ${vessel.name}`
      : `${kindLabel(doc.kind)} registration granted — ${vessel.name}`,
    body: doc.kind === 'DELETION'
      ? `${doc.certificateNo}: entry closed, ${kindLabel(doc.deletion.reason)}.`
      : `${doc.certificateNo} issued at ${R.portName(doc.portOfRegistry)}${doc.officialNumber ? `, official number ${doc.officialNumber}` : ''}.`,
    severity: doc.kind === 'DELETION' ? 'warning' : 'success',
    link: `/registry/${doc._id}`,
    audiencePerm: 'registry.view',
  }).catch(() => {});

  audit(req, { action: 'GRANT', entity: 'VesselRegistration', entityId: doc._id, entityLabel: `${doc.applicationNo} → ${doc.certificateNo}` });
  ok(res, { registration: doc, vessel: { _id: vessel._id, name: vessel.name, registry: vessel.registry } });
};

/* ------------------------------------------------------------ transcript --- */

/* The transcript of registry — the full extract a bank, a purchaser or a
 * foreign administration asks for. It is assembled from the granted
 * applications rather than stored, so it cannot drift from the register. */
exports.transcript = async (req, res) => {
  const vessel = await Vessel.findById(req.params.id).lean();
  if (!vessel) throw new ApiError(404, 'Vessel not found');
  const rows = await VesselRegistration.find({ vessel: vessel._id, status: 'GRANTED' })
    .sort({ grantedOn: 1 }).lean();
  const current = [...rows].reverse().find((r) => ['PERMANENT', 'PROVISIONAL'].includes(r.kind));
  const closure = rows.find((r) => r.kind === 'DELETION');
  const owners = (current && current.owners) || [];
  const ownershipAmendment = [...rows].reverse().find((r) => r.kind === 'AMENDMENT' && ((r.amendment || {}).types || []).includes('OWNERSHIP'));
  ok(res, {
    vessel: { _id: vessel._id, name: vessel.name, imo: vessel.imo, flag: vessel.flag, type: vessel.type, grt: vessel.grt, built: vessel.built },
    registry: vessel.registry || { state: 'UNREGISTERED' },
    registrar: getProfile().registry.registrar,
    portOfRegistry: vessel.registry && vessel.registry.portOfRegistry
      ? { code: vessel.registry.portOfRegistry, name: R.portName(vessel.registry.portOfRegistry) } : null,
    firstRegistered: current ? current.grantedOn : null,
    tonnage: current ? current.tonnage : null,
    owners: ownershipAmendment && ownershipAmendment.owners.length ? ownershipAmendment.owners : owners,
    shareLedger: R.shareLedger(ownershipAmendment && ownershipAmendment.owners.length ? ownershipAmendment.owners : owners),
    encumbrances: rows.flatMap((r) => r.encumbrances || []).filter((e) => !e.dischargedOn),
    closure: closure ? { reason: closure.deletion.reason, newFlag: closure.deletion.newFlag, certificateNo: closure.deletion.certificateNo, effectiveOn: closure.deletion.effectiveOn } : null,
    entries: rows.map((r) => ({
      applicationNo: r.applicationNo, kind: r.kind, certificateNo: r.certificateNo,
      grantedOn: r.grantedOn, grantedBy: r.grantedBy,
      note: r.kind === 'AMENDMENT' ? ((r.amendment || {}).types || []).join(', ') : '',
    })),
  });
};

/* ------------------------------------------------------------- dashboard --- */

exports.dashboard = async (_req, res) => {
  const now = new Date();
  const [rows, fleet] = await Promise.all([
    VesselRegistration.find().select('kind status submittedAt closedAt dueAt grantedOn portOfRegistry').lean(),
    Vessel.find().select('registry').lean(),
  ]);
  const open = rows.filter((r) => !['GRANTED', 'REJECTED', 'WITHDRAWN'].includes(r.status));
  const breached = open.filter((r) => r.dueAt && new Date(r.dueAt) < now);
  const closed = rows.filter((r) => r.closedAt && r.submittedAt);
  const avgDays = closed.length
    ? Math.round((closed.reduce((s, r) => s + (new Date(r.closedAt) - new Date(r.submittedAt)), 0) / closed.length / D) * 10) / 10
    : 0;
  const byState = {};
  fleet.forEach((v) => { const st = (v.registry && v.registry.state) || 'UNREGISTERED'; byState[st] = (byState[st] || 0) + 1; });
  const byKind = {};
  rows.forEach((r) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
  const byPort = {};
  rows.filter((r) => r.status === 'GRANTED').forEach((r) => { byPort[r.portOfRegistry] = (byPort[r.portOfRegistry] || 0) + 1; });

  // A provisional certificate that runs out leaves a ship with no valid
  // certificate of registry at all, so it is the one expiry worth surfacing.
  const provisionalExpiring = fleet.filter((v) => v.registry && v.registry.state === 'PROVISIONAL'
    && v.registry.certificateExpiresOn && new Date(v.registry.certificateExpiresOn) < new Date(now.getTime() + 60 * D)).length;

  ok(res, {
    total: rows.length,
    open: open.length,
    breached: breached.length,
    granted: rows.filter((r) => r.status === 'GRANTED').length,
    rejected: rows.filter((r) => r.status === 'REJECTED').length,
    avgDecisionDays: avgDays,
    slaCompliance: open.length ? Math.round(((open.length - breached.length) / open.length) * 100) : 100,
    registered: byState.REGISTERED || 0,
    provisional: byState.PROVISIONAL || 0,
    closedEntries: byState.CLOSED || 0,
    unregistered: byState.UNREGISTERED || 0,
    provisionalExpiring,
    byKind: Object.entries(byKind).map(([kind, count]) => ({ kind, count })),
    byPort: Object.entries(byPort).sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, name: R.portName(code), count })),
  });
};

/* --------------------------------------------------------- public search --- */

/* Anyone may confirm that an official number belongs to the ship it is claimed
 * for. Only what a certificate of registry itself shows is returned. */
exports.publicRegistry = async (req, res) => {
  const on = String(req.params.officialNumber || '').trim();
  const vessel = await Vessel.findOne({ 'registry.officialNumber': on })
    .select('name imo flag type grt built registry portOfRegistry').lean();
  if (!vessel) return ok(res, { found: false, officialNumber: on });
  const r = vessel.registry || {};
  const expired = r.certificateExpiresOn && new Date(r.certificateExpiresOn) < new Date();
  ok(res, {
    found: true,
    officialNumber: on,
    name: vessel.name,
    imo: vessel.imo,
    flag: vessel.flag,
    type: vessel.type,
    grossTonnage: vessel.grt,
    yearBuilt: vessel.built,
    portOfRegistry: R.portName(r.portOfRegistry) || vessel.portOfRegistry,
    certificateNo: r.certificateNo,
    registeredOn: r.registeredOn,
    state: r.state,
    valid: (r.state === 'REGISTERED') || (r.state === 'PROVISIONAL' && !expired),
    reason: r.state === 'CLOSED' ? `Registry closed — ${kindLabel(r.closureReason)}`
      : r.state === 'PROVISIONAL' ? (expired ? 'Provisional certificate has expired' : `Provisional certificate, valid to ${new Date(r.certificateExpiresOn).toISOString().slice(0, 10)}`)
        : r.state === 'REGISTERED' ? 'Registered' : 'Not on the register',
  });
};
