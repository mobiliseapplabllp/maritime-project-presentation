/* B1 — the statutory rules of ship registration, kept apart from the transport
 * that carries them.
 *
 * Nothing in here reaches the database or the request. It takes a registration
 * file, a vessel record and the two facts the controller has to go and fetch
 * (money outstanding against the ship, and whether it already sits on the
 * register) and returns what the registrar is entitled to conclude. That makes
 * every rule testable on its own, which matters more here than anywhere else in
 * the platform: these are the checks that decide whether a ship gets a
 * nationality. */
const { getProfile } = require('../config/jurisdictions');

const reg = (code) => getProfile(code).registry;

const portsOfRegistry = (code) => reg(code).portsOfRegistry;
const defaultPort = (code) => reg(code).defaultPort;
const portName = (portCode, code) => {
  const p = portsOfRegistry(code).find((x) => x.code === String(portCode || '').toUpperCase());
  return p ? p.name : '';
};
const isKnownPort = (portCode, code) => !!portName(portCode, code);

/** The share divisor and owner ceiling in force, with their provenance. */
function shareRules(code) {
  const r = reg(code);
  return {
    denominator: r.shareDenominator.value,
    maxOwners: r.maxRegisteredOwners.value,
    confirmed: r.shareDenominator.confirmed && r.maxRegisteredOwners.confirmed,
    sources: [r.shareDenominator.source, r.maxRegisteredOwners.source],
  };
}

/** Reduce an ownership list to the facts the registrar checks it against. */
function shareLedger(owners = [], code) {
  const { denominator, maxOwners } = shareRules(code);
  const held = owners.reduce((s, o) => s + (Number(o.shares) || 0), 0);
  return {
    denominator,
    held,
    balanced: held === denominator,
    owners: owners.length,
    maxOwners,
    withinLimit: owners.length > 0 && owners.length <= maxOwners,
  };
}

/* An Indian ship must be owned wholly by Indian citizens, by a company or body
 * established under Indian law with its principal place of business in India,
 * or by a co-operative society registered in India. A body corporate therefore
 * qualifies on its Indian registration, not on anyone's personal nationality,
 * which is why the two are tested differently. */
function qualifies(owner) {
  if (!owner) return { ok: false, why: 'No owner recorded' };
  if (owner.kind === 'INDIVIDUAL') {
    return /^indian$/i.test(String(owner.nationality || ''))
      ? { ok: true, why: 'Indian citizen' }
      : { ok: false, why: `${owner.name} is recorded as ${owner.nationality || 'of unstated nationality'}` };
  }
  if (owner.cin || owner.company) return { ok: true, why: 'Body established under Indian law' };
  return { ok: false, why: `${owner.name} has no Indian registration number on record` };
}

/* ------------------------------------------------------------- evidence --- */

// What the file must contain before the registrar will look at it. The key is
// what the applicant uploads against; `when` narrows a requirement to the cases
// it actually applies to, so a ship built in India is never asked for a
// deletion certificate it cannot have.
const EVIDENCE = {
  PERMANENT: [
    { key: 'DECLARATION_OF_OWNERSHIP', label: 'Declaration of ownership', mandatory: true },
    { key: 'TITLE_DOCUMENT', label: "Builder's certificate or bill of sale", mandatory: true },
    { key: 'TONNAGE_CERTIFICATE', label: 'Tonnage measurement certificate', mandatory: true },
    { key: 'SURVEY_CERTIFICATE', label: 'Certificate of survey', mandatory: true },
    { key: 'CLASS_CERTIFICATE', label: 'Classification certificate', mandatory: false },
    { key: 'INSURANCE_CERTIFICATE', label: 'Liability insurance / P&I cover note', mandatory: false },
    { key: 'DELETION_CERTIFICATE', label: 'Deletion certificate from the previous registry', mandatory: true, when: 'previouslyForeign' },
  ],
  PROVISIONAL: [
    { key: 'DECLARATION_OF_OWNERSHIP', label: 'Declaration of ownership', mandatory: true },
    { key: 'TITLE_DOCUMENT', label: "Builder's certificate or bill of sale", mandatory: true },
    { key: 'TONNAGE_CERTIFICATE', label: 'Tonnage measurement certificate', mandatory: false },
  ],
  AMENDMENT: [
    { key: 'AMENDMENT_APPLICATION', label: 'Application stating the alteration', mandatory: true },
    { key: 'SUPPORTING_EVIDENCE', label: 'Evidence supporting the alteration', mandatory: true },
    { key: 'NAME_APPROVAL', label: 'Prior approval of the new name', mandatory: true, when: 'nameChange' },
    { key: 'TITLE_DOCUMENT', label: 'Bill of sale or transfer instrument', mandatory: true, when: 'ownershipChange' },
    { key: 'TONNAGE_CERTIFICATE', label: 'Revised tonnage measurement certificate', mandatory: true, when: 'tonnageChange' },
  ],
  DELETION: [
    { key: 'CLOSURE_APPLICATION', label: 'Application for closure of registry', mandatory: true },
    { key: 'MORTGAGE_DISCHARGE', label: 'Discharge of registered mortgage', mandatory: true, when: 'encumbered' },
    { key: 'DUES_CLEARANCE', label: 'Clearance of port dues and government charges', mandatory: true },
    { key: 'TITLE_DOCUMENT', label: 'Bill of sale to the foreign purchaser', mandatory: true, when: 'soldForeign' },
  ],
};

/** Which conditional requirements are live for this particular file. */
function conditionsFor(doc) {
  const types = (doc.amendment && doc.amendment.types) || [];
  return {
    previouslyForeign: !!(doc.previousFlag && !/^india$/i.test(doc.previousFlag)),
    nameChange: types.includes('NAME'),
    ownershipChange: types.includes('OWNERSHIP'),
    tonnageChange: types.includes('TONNAGE'),
    encumbered: (doc.encumbrances || []).some((e) => !e.dischargedOn),
    soldForeign: (doc.deletion && doc.deletion.reason) === 'SOLD_FOREIGN',
  };
}

/** The evidence this file must carry, conditionals resolved. */
function requiredEvidence(doc) {
  const cond = conditionsFor(doc);
  return (EVIDENCE[doc.kind] || []).filter((e) => !e.when || cond[e.when]);
}

/* --------------------------------------------------------------- checks --- */

const check = (name, passed, blocking, detail) => ({ check: name, passed, blocking, detail });

/* Every check the registrar runs, in one place.
 *
 * `context` carries what only the database can answer: `onRegister` — whether
 * this ship already holds a granted entry — and `outstandingDues`, the money
 * owed against it. Both are passed in rather than fetched so the rules can be
 * tested without one. */
function registrationChecks(doc, vessel, context = {}, code) {
  const out = [];
  const { onRegister = false, outstandingDues = 0, currency = 'INR', bridging = false } = context;
  const first = doc.kind === 'PERMANENT' || doc.kind === 'PROVISIONAL';

  // 1. the ship's standing on the register
  if (first) {
    out.push(check('Ship is not already on the register', !onRegister, true,
      onRegister ? `${vessel ? vessel.name : 'This ship'} already holds a registry entry` : 'No subsisting entry'));
    if (bridging) {
      out.push(check('Supersedes a provisional certificate', true, false,
        'The provisional entry closes on grant of the permanent certificate, and the official number carries forward'));
    }
  } else {
    out.push(check('Ship holds a subsisting registry entry', onRegister, true,
      onRegister ? 'On the register' : 'No granted registration found for this ship'));
  }

  // 2. port of registry
  out.push(check('Port of registry is a declared port', isKnownPort(doc.portOfRegistry, code), true,
    isKnownPort(doc.portOfRegistry, code)
      ? `${portName(doc.portOfRegistry, code)} (${doc.portOfRegistry})`
      : `${doc.portOfRegistry || 'None'} is not a declared port of registry`));

  // 3. ownership — only where ownership is in issue
  if (first || (doc.amendment && (doc.amendment.types || []).includes('OWNERSHIP'))) {
    const ledger = shareLedger(doc.owners, code);
    out.push(check('Ownership shares account for the whole ship', ledger.balanced, true,
      `${ledger.held} of ${ledger.denominator} shares allotted across ${ledger.owners} owner(s)`));
    out.push(check('Registered owners within the statutory maximum', ledger.withinLimit, true,
      ledger.owners === 0 ? 'No owners recorded'
        : `${ledger.owners} owner(s), maximum ${ledger.maxOwners}`));

    const failed = (doc.owners || []).map((o) => ({ o, q: qualifies(o) })).filter((x) => !x.q.ok);
    out.push(check('Every owner qualifies to own an Indian ship', failed.length === 0, true,
      failed.length ? failed.map((f) => f.q.why).join('; ') : `${(doc.owners || []).length} owner(s) qualify`));
  }

  // 4. tonnage
  if (first) {
    const measured = !!(doc.tonnage && doc.tonnage.gross && doc.tonnage.net);
    out.push(check('Tonnage measured and certified', measured, doc.kind === 'PERMANENT',
      measured ? `${doc.tonnage.gross} GT / ${doc.tonnage.net} NT, certificate ${doc.tonnage.certificateNo || 'not referenced'}`
        : 'Gross and net tonnage not recorded'));
    if (measured && vessel && vessel.grt) {
      const drift = Math.abs(doc.tonnage.gross - vessel.grt) / vessel.grt;
      out.push(check('Declared tonnage agrees with the fleet record', drift <= 0.02, false,
        drift <= 0.02 ? `Within tolerance of the recorded ${vessel.grt} GT`
          : `Declared ${doc.tonnage.gross} GT against ${vessel.grt} GT on the fleet record`));
    }
  }

  // 5. evidence on file
  const required = requiredEvidence(doc).filter((e) => e.mandatory);
  const held = new Set((doc.evidence || []).map((e) => e.key));
  const absent = required.filter((e) => !held.has(e.key));
  out.push(check('Mandatory evidence on file', absent.length === 0, true,
    absent.length ? `Not lodged: ${absent.map((e) => e.label).join(', ')}`
      : `${required.length} mandatory document(s) lodged`));

  const unverified = (doc.evidence || []).filter((e) => required.some((r) => r.key === e.key) && !e.verified);
  out.push(check('Lodged evidence verified by the registry', unverified.length === 0, false,
    unverified.length ? `${unverified.length} document(s) awaiting verification` : 'All mandatory evidence verified'));

  // 6. carving and marking — a permanent certificate cannot be granted until the
  // official number is cut into the ship and a surveyor has said so
  if (doc.kind === 'PERMANENT') {
    const complied = !!(doc.carvingNote && doc.carvingNote.compliedOn);
    out.push(check('Carving and marking note complied with', complied, true,
      complied ? `Reported by ${doc.carvingNote.surveyor || 'surveyor'} on ${new Date(doc.carvingNote.compliedOn).toISOString().slice(0, 10)}`
        : doc.carvingNote && doc.carvingNote.issuedOn ? 'Note issued, compliance not yet reported'
          : 'Carving and marking note not yet issued'));
  }

  // 7. closure — nothing leaves the register owing money or carrying a mortgage
  if (doc.kind === 'DELETION') {
    const live = (doc.encumbrances || []).filter((e) => !e.dischargedOn);
    out.push(check('No subsisting mortgage or charge', live.length === 0, true,
      live.length ? `${live.length} undischarged: ${live.map((e) => `${e.kind.toLowerCase()} in favour of ${e.holder}`).join(', ')}`
        : 'Encumbrance register clear'));
    out.push(check('Port dues and charges settled', outstandingDues <= 0, true,
      outstandingDues > 0 ? `${currency} ${outstandingDues.toLocaleString('en-IN')} outstanding against this ship`
        : 'Nothing outstanding'));
    out.push(check('Ground for closure stated', !!(doc.deletion && doc.deletion.reason), true,
      doc.deletion && doc.deletion.reason ? doc.deletion.reason.replace(/_/g, ' ').toLowerCase() : 'No ground recorded'));
    if ((doc.deletion || {}).reason === 'SOLD_FOREIGN') {
      out.push(check('Receiving flag stated', !!doc.deletion.newFlag, true,
        doc.deletion.newFlag || 'The flag the ship transfers to must be stated on the deletion certificate'));
    }
  }

  // 8. amendment — what is being altered has to be said
  if (doc.kind === 'AMENDMENT') {
    const types = (doc.amendment && doc.amendment.types) || [];
    out.push(check('Nature of the alteration stated', types.length > 0, true,
      types.length ? types.map((t) => t.replace(/_/g, ' ').toLowerCase()).join(', ') : 'No alteration type selected'));
    if (types.includes('NAME')) {
      const approved = !!(doc.amendment.approvalReference);
      out.push(check('New name approved in advance', approved, true,
        approved ? `Approval ${doc.amendment.approvalReference}` : 'A ship may not be renamed without prior approval'));
    }
  }

  // 9. the ship itself
  if (vessel) {
    out.push(check('Fleet record is active', vessel.status === 'ACTIVE', false,
      `Vessel record is ${String(vessel.status || '').toLowerCase()}`));
  }

  return out;
}

const blocking = (checks) => checks.filter((c) => c.blocking && !c.passed);

/* Official numbers are allocated in one unbroken series across the register,
 * not per port — the number identifies the ship for the life of the entry and
 * must never be reused, so it is taken from the highest ever allocated rather
 * than from a count of live entries. */
async function nextOfficialNumber(Model, code) {
  const base = reg(code).officialNumberBase;
  const last = await Model.findOne({ officialNumber: { $ne: '' } })
    .sort({ officialNumber: -1 }).select('officialNumber').lean();
  const n = last && /^\d+$/.test(last.officialNumber) ? Number(last.officialNumber) + 1 : base;
  return String(Math.max(n, base));
}

module.exports = {
  portsOfRegistry, defaultPort, portName, isKnownPort,
  shareRules, shareLedger, qualifies,
  EVIDENCE, conditionsFor, requiredEvidence,
  registrationChecks, blocking, nextOfficialNumber,
};
