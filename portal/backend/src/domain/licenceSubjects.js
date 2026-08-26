/* A1 — subject resolution and issue-time dependency checks for the regulated
 * instrument engine.
 *
 * The licensing lifecycle is identical whoever the instrument is issued against;
 * what differs is how the subject is named and what must be true before it can
 * be issued. Both live here so the controller stays one code path. */
const { Vessel, Seafarer, Company, Berth } = require('../models');
const { certStatus } = require('./certStatus');
const {
  LICENSE_TYPES_BY_SUBJECT, INSTRUMENT_CLASS_BY_TYPE, NUMBER_PREFIX_BY_CLASS,
  NUMBER_PREFIX_BY_TYPE, SUBJECT_PERMS, VALIDITY_MONTHS,
} = require('../config/constants');

const MODEL_BY_KIND = {
  COMPANY: Company, VESSEL: Vessel, SEAFARER: Seafarer, PORT_FACILITY: Berth, MET_INSTITUTION: Company,
};
const MODEL_NAME_BY_KIND = {
  COMPANY: 'Company', VESSEL: 'Vessel', SEAFARER: 'Seafarer',
  PORT_FACILITY: 'Berth', MET_INSTITUTION: 'Company',
};

/** Human label for a subject document, used as the denormalised entityName. */
function labelFor(kind, doc) {
  if (!doc) return '';
  if (kind === 'VESSEL') return `${doc.name}${doc.imo ? ` (IMO ${doc.imo})` : ''}`;
  if (kind === 'SEAFARER') return `${doc.name}${doc.cdcNo ? ` (CDC ${doc.cdcNo})` : ''}`;
  if (kind === 'PORT_FACILITY') return `${doc.name || doc.code}${doc.code && doc.name ? ` (${doc.code})` : ''}`;
  return doc.name || doc.entityName || '';
}

/** Resolve the subject document, or null when the instrument has no linked record. */
async function resolveSubject(kind, ref) {
  if (!ref) return null;
  const Model = MODEL_BY_KIND[kind];
  if (!Model) return null;
  return Model.findById(ref).lean();
}

const instrumentClassFor = (type) => INSTRUMENT_CLASS_BY_TYPE[type] || 'LICENCE';
const numberPrefixFor = (type) => NUMBER_PREFIX_BY_TYPE[type]
  || NUMBER_PREFIX_BY_CLASS[instrumentClassFor(type)] || 'LIC';
const permBaseFor = (kind) => SUBJECT_PERMS[kind] || 'facilities';
const validityMonthsFor = (type) => VALIDITY_MONTHS[instrumentClassFor(type)] || 24;
const typeAllowedFor = (kind, type) => (LICENSE_TYPES_BY_SUBJECT[kind] || []).includes(type);

/* ---------------------------------------------------------------- checks ---
 * Every check returns { check, passed, detail }. They are advisory by default:
 * the controller records them on the instrument and blocks issue only on a
 * failed check that is marked blocking. That keeps an officer able to issue
 * against a documented exception, which is how these regimes actually work. */

function vesselChecks(v) {
  const out = [];
  out.push({
    check: 'Vessel is on the active register', passed: v.status === 'ACTIVE', blocking: true,
    detail: v.status === 'ACTIVE' ? 'Active' : `Vessel status is ${v.status}`,
  });

  const certs = (v.certificates || []).map((c) => ({ type: c.certType, state: certStatus(c.expiryDate) }));
  const expired = certs.filter((c) => c.state === 'EXPIRED');
  out.push({
    check: 'Statutory certificates in force', passed: expired.length === 0, blocking: true,
    detail: expired.length
      ? `${expired.length} expired: ${expired.map((c) => c.type).join(', ')}`
      : `${certs.length} certificates, none expired`,
  });

  const expiring = certs.filter((c) => c.state === 'EXPIRING');
  out.push({
    check: 'No certificate expiring inside the window', passed: expiring.length === 0, blocking: false,
    detail: expiring.length ? `${expiring.length} expiring shortly: ${expiring.map((c) => c.type).join(', ')}`
      : 'None expiring',
  });

  const dockLapsed = v.nextDryDock && new Date(v.nextDryDock) < new Date();
  out.push({
    check: 'Class docking survey current', passed: !dockLapsed, blocking: false,
    detail: dockLapsed ? `Docking lapsed ${new Date(v.nextDryDock).toISOString().slice(0, 10)}`
      : v.nextDryDock ? `Next docking ${new Date(v.nextDryDock).toISOString().slice(0, 10)}` : 'Not recorded',
  });
  return out;
}

function seafarerChecks(s) {
  const out = [];
  const docs = (s.certificates || []).map((c) => ({ type: c.certType, state: certStatus(c.expiryDate) }));
  const expired = docs.filter((d) => d.state === 'EXPIRED');
  out.push({
    check: 'Seafarer documents in force', passed: expired.length === 0, blocking: true,
    detail: expired.length ? `${expired.length} expired: ${expired.map((d) => d.type).join(', ')}`
      : `${docs.length} documents, none expired`,
  });

  const medical = docs.find((d) => /medical/i.test(d.type));
  out.push({
    check: 'Medical fitness certificate valid', passed: !!medical && medical.state !== 'EXPIRED', blocking: true,
    detail: medical ? `Medical is ${medical.state.toLowerCase()}` : 'No medical fitness certificate on record',
  });
  return out;
}

function companyChecks(c) {
  return [{
    check: 'Company is on the directory and not blacklisted',
    passed: c.status !== 'BLACKLISTED' && c.active !== false, blocking: true,
    detail: c.status === 'BLACKLISTED' ? 'Company is blacklisted' : 'In good standing',
  }];
}

function facilityChecks(b) {
  return [{
    check: 'Port facility is operational', passed: b.status === 'OPERATIONAL', blocking: false,
    detail: `Facility status is ${b.status}`,
  }];
}

/** Run the dependency checks for a subject. Returns [] when nothing is linked. */
async function runIssueChecks(kind, ref) {
  const doc = await resolveSubject(kind, ref);
  if (!doc) return [];
  if (kind === 'VESSEL') return vesselChecks(doc);
  if (kind === 'SEAFARER') return seafarerChecks(doc);
  if (kind === 'PORT_FACILITY') return facilityChecks(doc);
  return companyChecks(doc);
}

const blockingFailures = (checks) => checks.filter((c) => c.blocking && !c.passed);

module.exports = {
  MODEL_NAME_BY_KIND, labelFor, resolveSubject, runIssueChecks, blockingFailures,
  instrumentClassFor, numberPrefixFor, permBaseFor, validityMonthsFor, typeAllowedFor,
};
