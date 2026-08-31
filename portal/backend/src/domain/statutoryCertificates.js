/* B2 — the convention certificates, and the survey regime each one runs on.
 *
 * A domestic licence is in force until it expires. A statutory certificate is
 * not: it carries a schedule of surveys through its five-year term, and a
 * certificate whose annual survey window has closed unendorsed has ceased to be
 * valid even though its expiry date is years away. Port state control acts on
 * that distinction, so the register has to hold it rather than reduce every
 * instrument to an expiry date.
 *
 * The regimes below come from the conventions the certificates are issued
 * under: SOLAS chapter I for the safety certificates, the Load Line Convention,
 * MARPOL Annexes I, IV and VI, the ISM and ISPS Codes, and MLC 2006. */
const {
  VESSEL_STATUTORY_CERT_TYPES, COMPANY_STATUTORY_CERT_TYPES,
} = require('../config/constants');

const STATUTORY_TYPES = [...VESSEL_STATUTORY_CERT_TYPES, ...COMPANY_STATUTORY_CERT_TYPES];
const isStatutory = (type) => STATUTORY_TYPES.includes(type);

// The name as printed on the certificate. These double as the key used on the
// vessel's own certificate list, so an instrument issued here lands on the
// fleet expiry screens under the name the crew already know it by.
const CERT_LABEL = {
  CARGO_SHIP_SAFETY_CONSTRUCTION: 'Cargo Ship Safety Construction Certificate',
  CARGO_SHIP_SAFETY_EQUIPMENT: 'Cargo Ship Safety Equipment Certificate',
  CARGO_SHIP_SAFETY_RADIO: 'Cargo Ship Safety Radio Certificate',
  INTERNATIONAL_LOAD_LINE: 'Load Line Certificate',
  IOPP_CERTIFICATE: 'IOPP Certificate',
  IAPP_CERTIFICATE: 'IAPP Certificate',
  SEWAGE_POLLUTION_PREVENTION: 'ISPP Certificate',
  SAFETY_MANAGEMENT_CERTIFICATE: 'Safety Management Certificate',
  SHIP_SECURITY_CERTIFICATE: 'International Ship Security Certificate',
  MARITIME_LABOUR_CERTIFICATE: 'Maritime Labour Certificate',
  TONNAGE_CERTIFICATE: 'Tonnage Certificate',
  MINIMUM_SAFE_MANNING_DOCUMENT: 'Minimum Safe Manning Document',
  DOCUMENT_OF_COMPLIANCE: 'Document of Compliance',
};

const CONVENTION = {
  CARGO_SHIP_SAFETY_CONSTRUCTION: 'SOLAS 1974, chapter I',
  CARGO_SHIP_SAFETY_EQUIPMENT: 'SOLAS 1974, chapter I',
  CARGO_SHIP_SAFETY_RADIO: 'SOLAS 1974, chapter I',
  INTERNATIONAL_LOAD_LINE: 'International Convention on Load Lines 1966',
  IOPP_CERTIFICATE: 'MARPOL Annex I',
  IAPP_CERTIFICATE: 'MARPOL Annex VI',
  SEWAGE_POLLUTION_PREVENTION: 'MARPOL Annex IV',
  SAFETY_MANAGEMENT_CERTIFICATE: 'ISM Code',
  SHIP_SECURITY_CERTIFICATE: 'ISPS Code',
  MARITIME_LABOUR_CERTIFICATE: 'Maritime Labour Convention 2006',
  TONNAGE_CERTIFICATE: 'International Convention on Tonnage Measurement of Ships 1969',
  MINIMUM_SAFE_MANNING_DOCUMENT: 'SOLAS chapter V, regulation 14',
  DOCUMENT_OF_COMPLIANCE: 'ISM Code',
};

/* Which surveys fall due through the term.
 *
 * `annual` means a survey at each anniversary; `intermediate` means one survey
 * falling between the second and third anniversary in place of, or in addition
 * to, the annual at that point. Certificates issued once and reissued only on
 * change carry neither. */
const SURVEY_REGIME = {
  CARGO_SHIP_SAFETY_CONSTRUCTION: { annual: true, intermediate: true },
  CARGO_SHIP_SAFETY_EQUIPMENT: { annual: true, intermediate: true },
  CARGO_SHIP_SAFETY_RADIO: { annual: true, intermediate: false },
  INTERNATIONAL_LOAD_LINE: { annual: true, intermediate: false },
  IOPP_CERTIFICATE: { annual: true, intermediate: true },
  IAPP_CERTIFICATE: { annual: true, intermediate: true },
  SEWAGE_POLLUTION_PREVENTION: { annual: false, intermediate: false },
  SAFETY_MANAGEMENT_CERTIFICATE: { annual: false, intermediate: true },
  SHIP_SECURITY_CERTIFICATE: { annual: false, intermediate: true },
  MARITIME_LABOUR_CERTIFICATE: { annual: false, intermediate: true },
  TONNAGE_CERTIFICATE: { annual: false, intermediate: false },
  MINIMUM_SAFE_MANNING_DOCUMENT: { annual: false, intermediate: false },
  DOCUMENT_OF_COMPLIANCE: { annual: true, intermediate: false },
};

/* Two of these are issued once and reissued on change rather than renewed. The
 * register still carries an expiry date for them, because one expiry rule
 * serving every instrument is worth more than a null, but nothing should put
 * that date in front of a reader as a renewal deadline. */
const NON_EXPIRING = new Set(['TONNAGE_CERTIFICATE', 'MINIMUM_SAFE_MANNING_DOCUMENT']);
const nonExpiring = (type) => NON_EXPIRING.has(type);

const MONTH = 30.44 * 86400000;
const addMonths = (date, months) => new Date(new Date(date).getTime() + months * MONTH);

/* The survey schedule for one certificate.
 *
 * An annual survey is due on the anniversary and may be held within three
 * months either side of it; the intermediate survey stands in the same relation
 * to the second or third anniversary. The window is what makes the schedule
 * usable — a survey held six weeks early is on time, and a register that only
 * stored the anniversary would say otherwise. */
function endorsementSchedule(type, issueDate, expiryDate) {
  const regime = SURVEY_REGIME[type];
  if (!regime || !issueDate) return [];
  const issued = new Date(issueDate);
  const expires = expiryDate ? new Date(expiryDate) : addMonths(issued, 60);
  const termYears = Math.round((expires - issued) / (MONTH * 12));
  if (termYears < 2) return [];

  const out = [];
  if (regime.annual) {
    for (let y = 1; y < termYears; y += 1) {
      const anniversary = addMonths(issued, y * 12);
      out.push({
        kind: 'ANNUAL', anniversary,
        dueFrom: addMonths(anniversary, -3), dueTo: addMonths(anniversary, 3),
      });
    }
  }
  if (regime.intermediate) {
    const anniversary = addMonths(issued, 30);   // between the second and third
    out.push({
      kind: 'INTERMEDIATE', anniversary,
      dueFrom: addMonths(issued, 24), dueTo: addMonths(issued, 36),
    });
  }
  return out.sort((a, b) => a.anniversary - b.anniversary);
}

/* Where a certificate stands against its schedule right now.
 *
 * An endorsement is overdue once its window has closed with nothing recorded
 * against it, and a certificate with an overdue endorsement is not in force
 * whatever its expiry date says. */
function endorsementState(doc, now = new Date()) {
  const recorded = doc.endorsements || [];
  const done = (kind, anniversary) => recorded.find((e) => e.kind === kind
    && e.completedOn
    && Math.abs(new Date(e.anniversary || e.dueTo || 0) - new Date(anniversary)) < MONTH * 4
    && e.result !== 'NOT_ENDORSED');

  const schedule = endorsementSchedule(doc.entityType, doc.issueDate, doc.expiryDate).map((s) => {
    const hit = done(s.kind, s.anniversary);
    const overdue = !hit && new Date(s.dueTo) < now;
    const open = !hit && !overdue && new Date(s.dueFrom) <= now;
    return {
      ...s,
      completedOn: hit ? hit.completedOn : null,
      surveyor: hit ? hit.surveyor : '',
      result: hit ? hit.result : '',
      state: hit ? 'ENDORSED' : overdue ? 'OVERDUE' : open ? 'DUE' : 'SCHEDULED',
    };
  });

  const overdue = schedule.filter((s) => s.state === 'OVERDUE');
  const due = schedule.filter((s) => s.state === 'DUE');
  const refused = recorded.filter((e) => e.result === 'NOT_ENDORSED');
  return {
    schedule,
    overdue: overdue.length,
    due: due.length,
    next: schedule.find((s) => s.state === 'DUE' || s.state === 'SCHEDULED') || null,
    refused: refused.length,
  };
}

/* Whether an instrument is in force, and why not when it is not.
 *
 * The order of the tests is the order a port state control officer applies
 * them: status first, then expiry, then the survey schedule. */
function forceState(doc, now = new Date()) {
  if (doc.status !== 'ISSUED') {
    return { inForce: false, reason: `Instrument is ${String(doc.status || '').toLowerCase()}` };
  }
  if (doc.expiryDate && new Date(doc.expiryDate) < now) {
    return { inForce: false, reason: 'Expired' };
  }
  if (!isStatutory(doc.entityType)) return { inForce: true, reason: 'In force' };
  const st = endorsementState(doc, now);
  if (st.refused) return { inForce: false, reason: 'A survey was carried out and the certificate not endorsed' };
  if (st.overdue) {
    return { inForce: false, reason: `${st.overdue} survey endorsement(s) overdue`, endorsements: st };
  }
  return { inForce: true, reason: 'In force', endorsements: st };
}

module.exports = {
  STATUTORY_TYPES, isStatutory, nonExpiring, CERT_LABEL, CONVENTION, SURVEY_REGIME,
  endorsementSchedule, endorsementState, forceState,
};
