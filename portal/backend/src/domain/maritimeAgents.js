/* The seven maritime AI agents, as pure judgements.
 *
 * Nothing here reaches the database, the clock is injected, and every function
 * returns the same shape: what it was given, what it concluded, why, the
 * weighted factors behind it, and how confident it is. The runner turns that
 * into a record; the agent's autonomy level decides whether the conclusion is
 * applied, queued or escalated — which is deliberately not this file's business.
 *
 * Keeping the judgement pure is what makes it testable. An agent that can only
 * be evaluated by standing up a database is an agent nobody audits. */

const { DEFAULT_RISK_WEIGHTS } = require('../config/constants');
const St = require('./statutoryCertificates');

const DAY = 86400000;
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const days = (from, to) => Math.round((new Date(to) - new Date(from)) / DAY);
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

/* An IMO number carries its own check digit: the first six digits weighted
 * 7,6,5,4,3,2, summed, and the last digit of that sum is the seventh. A number
 * that fails this was mistyped or invented, and no amount of document quality
 * makes it valid. */
function imoCheckDigitValid(imo) {
  const s = String(imo || '').replace(/\D/g, '');
  if (s.length !== 7) return false;
  const sum = [7, 6, 5, 4, 3, 2].reduce((t, w, i) => t + w * Number(s[i]), 0);
  return sum % 10 === Number(s[6]);
}

/** Issuing bodies this administration recognises on a submitted document. */
const RECOGNISED_ISSUER_NAMES = [
  'directorate general of shipping', 'registrar of indian ships', 'flag administration',
  'indian register of shipping', "lloyd's register", 'bureau veritas', 'classnk',
  'american bureau of shipping', 'det norske veritas',
];
/* The trade writes these as initials as often as in full, and the initials are
 * short enough that a substring test matches inside ordinary words — "unknown"
 * contains "nk". So abbreviations are matched as whole tokens, never as
 * substrings, and only full names are matched loosely. */
const RECOGNISED_ISSUER_CODES = new Set(['ro', 'irs', 'lr', 'abs', 'bv', 'nk', 'dnv', 'ccs', 'kr', 'rina']);
const issuerRecognised = (issuer) => {
  const v = String(issuer || '').trim().toLowerCase();
  if (!v) return false;
  if (RECOGNISED_ISSUER_NAMES.some((r) => v.includes(r))) return true;
  return v.split(/[^a-z]+/).filter(Boolean).some((tok) => RECOGNISED_ISSUER_CODES.has(tok));
};

const factor = (name, weight, value, contribution) => ({
  factor: name, weight, value: String(value), contribution: round(contribution, 3),
});

/* ============================================================ A1 — documents */
/* Reads a lodged application against the document list its service actually
 * requires, and checks each supporting document for the things a clerk checks:
 * is it there, is it the right one, do its dates cohere, was it issued by a body
 * we recognise, and does the identifier on it survive its own checksum. */
function documentIntelligence(req, def, subjectDoc, now = new Date()) {
  const required = (def && def.requiredDocuments) || [];
  const lodged = req.documents || [];
  const byKey = new Map(lodged.map((d) => [d.key, d]));

  const mandatory = required.filter((r) => r.mandatory);
  const missing = mandatory.filter((r) => !byKey.has(r.key));
  const present = required.filter((r) => byKey.has(r.key));
  const unverified = present.filter((r) => !byKey.get(r.key).verified);

  const completeness = required.length ? present.length / required.length : 1;
  const verifiedShare = present.length
    ? (present.length - unverified.length) / present.length : 1;

  // identifier and date checks against the subject the application is about
  const checks = [];
  if (subjectDoc && subjectDoc.imo) {
    checks.push({ name: 'IMO check digit', ok: imoCheckDigitValid(subjectDoc.imo), detail: subjectDoc.imo });
  }
  const certs = (subjectDoc && subjectDoc.certificates) || [];
  const incoherent = certs.filter((c) => c.issueDate && c.expiryDate
    && new Date(c.issueDate) > new Date(c.expiryDate));
  const futureIssued = certs.filter((c) => c.issueDate && new Date(c.issueDate) > now);
  const unknownIssuer = certs.filter((c) => c.issuer && !issuerRecognised(c.issuer));
  if (certs.length) {
    checks.push({ name: 'Date coherence', ok: incoherent.length === 0 && futureIssued.length === 0, detail: `${certs.length} certificates read` });
    checks.push({ name: 'Issuing authority recognised', ok: unknownIssuer.length === 0, detail: unknownIssuer.length ? unknownIssuer[0].issuer : 'all recognised' });
  }
  const failedChecks = checks.filter((c) => !c.ok);

  const confidence = clamp01(
    0.45 * completeness
    + 0.25 * verifiedShare
    + 0.30 * (checks.length ? (checks.length - failedChecks.length) / checks.length : 1),
  );

  const factors = [
    factor('Required documents present', 0.45, `${present.length}/${required.length}`, 0.45 * completeness),
    factor('Documents verified', 0.25, `${present.length - unverified.length}/${present.length}`, 0.25 * verifiedShare),
    factor('Integrity checks passed', 0.30, `${checks.length - failedChecks.length}/${checks.length}`,
      0.30 * (checks.length ? (checks.length - failedChecks.length) / checks.length : 1)),
  ];

  const clean = !missing.length && !failedChecks.length;
  return {
    action: clean ? 'Validated the submitted documents' : 'Flagged a document problem',
    subject: { type: 'ServiceRequest', id: String(req._id), label: req.requestNo },
    inputs: { service: req.serviceCode, requiredDocuments: required.length, lodged: lodged.length },
    output: {
      complete: !missing.length,
      missing: missing.map((m) => m.label),
      unverified: unverified.map((u) => u.label),
      failedChecks: failedChecks.map((c) => `${c.name}: ${c.detail}`),
    },
    explanation: clean
      ? `All ${required.length} required documents are on file and every integrity check passed.`
      : [
        missing.length ? `${missing.length} mandatory document(s) missing: ${missing.map((m) => m.label).join(', ')}` : '',
        failedChecks.length ? `${failedChecks.length} integrity check(s) failed: ${failedChecks.map((c) => c.name).join(', ')}` : '',
        unverified.length ? `${unverified.length} document(s) lodged but not yet verified` : '',
      ].filter(Boolean).join('. '),
    factors,
    confidence: round(confidence, 3),
  };
}

/* ================================================== A2 — vessel compliance */
/* Scores a vessel the way the register does, then adds the thing an expiry date
 * alone cannot tell you: whether its statutory certificates are actually in
 * force, which depends on the survey endorsements behind them. */
function vesselCompliance(vessel, ctx = {}, now = new Date()) {
  const w = DEFAULT_RISK_WEIGHTS;
  const inspections = ctx.inspections || [];
  const instruments = ctx.instruments || [];

  const age = vessel.built ? now.getFullYear() - vessel.built : 0;
  const ageScore = clamp01(age / 25);

  const certs = vessel.certificates || [];
  const expired = certs.filter((c) => new Date(c.expiryDate) < now);
  const expiring = certs.filter((c) => {
    const d = days(now, c.expiryDate);
    return d >= 0 && d <= 30;
  });
  const certScore = certs.length ? clamp01((expired.length * 1 + expiring.length * 0.4) / certs.length) : 0.5;

  const findings = inspections.reduce((t, i) => t + ((i.findings || []).length), 0);
  const defScore = inspections.length ? clamp01(findings / (inspections.length * 5)) : 0;
  const detentions = inspections.filter((i) => i.result === 'DETAINED').length;
  const detScore = inspections.length ? clamp01(detentions / inspections.length * 3) : 0;

  const last = inspections.map((i) => i.date || i.createdAt).filter(Boolean).sort().pop();
  const gapDays = last ? days(last, now) : 400;
  const gapScore = clamp01(gapDays / 365);

  // an instrument in date but carrying an overdue survey endorsement is not in force
  const notInForce = instruments
    .map((i) => ({ i, f: St.forceState(i, now) }))
    .filter((x) => !x.f.inForce);
  const forceScore = instruments.length ? clamp01(notInForce.length / instruments.length) : 0;

  const parts = [
    ['Vessel age', w.age, age ? `${age} yrs` : 'unknown', ageScore],
    ['Certificate standing', w.certificates, `${expired.length} expired · ${expiring.length} expiring`, certScore],
    ['Deficiency history', w.deficiencies, `${findings} across ${inspections.length} inspections`, defScore],
    ['Detentions', w.detentions, `${detentions}`, detScore],
    ['Inspection gap', w.inspectionGap, `${gapDays} days`, gapScore],
    ['Instruments not in force', w.agentPerformance, `${notInForce.length}/${instruments.length}`, forceScore],
  ];
  const score = Math.round(parts.reduce((t, [, weight, , s]) => t + weight * s, 0));
  const band = score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';

  // the score itself is deterministic, so confidence reflects how much evidence
  // stood behind it rather than how sure the arithmetic is
  const evidence = clamp01((inspections.length / 6) * 0.5 + (certs.length / 8) * 0.3 + (instruments.length ? 0.2 : 0));
  return {
    action: notInForce.length ? 'Flagged a certificate not in force' : 'Rescored vessel compliance',
    subject: { type: 'Vessel', id: String(vessel._id), label: `${vessel.name} (IMO ${vessel.imo})` },
    inputs: { certificates: certs.length, inspections: inspections.length, instruments: instruments.length },
    output: {
      score, band, expired: expired.length, expiring: expiring.length,
      notInForce: notInForce.map((x) => `${x.i.entityType}: ${x.f.reason}`),
    },
    explanation: notInForce.length
      ? `${notInForce.length} instrument(s) are not in force — ${notInForce[0].f.reason}. Composite compliance risk ${score}/100 (${band.toLowerCase()}).`
      : `Composite compliance risk ${score}/100 (${band.toLowerCase()}) from ${inspections.length} inspections and ${certs.length} certificates.`,
    factors: parts.map(([n, weight, v, s]) => factor(n, weight, v, weight * s)),
    confidence: round(0.55 + 0.4 * evidence, 3),
  };
}

/* ================================================= A3 — service processing */
/* Runs the eligibility gates a service actually defines, in the order an officer
 * runs them, and stops at the first one that fails. A clean pass is the only
 * case that can ever go through without a human. */
function serviceProcessing(req, def, subjectDoc, ctx = {}, now = new Date()) {
  const gates = [];
  const push = (name, passed, detail) => gates.push({ gate: name, passed, detail });

  const required = (def && def.requiredDocuments) || [];
  const byKey = new Map((req.documents || []).map((d) => [d.key, d]));
  const missing = required.filter((r) => r.mandatory && !byKey.has(r.key));
  push('Mandatory documents on file', missing.length === 0,
    missing.length ? `missing ${missing.map((m) => m.label).join(', ')}` : `${required.length} on file`);

  const unverified = required.filter((r) => byKey.has(r.key) && !byKey.get(r.key).verified);
  push('Documents verified', unverified.length === 0,
    unverified.length ? `${unverified.length} awaiting verification` : 'all verified');

  push('Subject on record', !!subjectDoc,
    subjectDoc ? req.subjectLabel : 'subject not found on the register');

  const fee = (def && def.fee) || {};
  push('Fee settled', !!(req.fee && req.fee.paid) || !fee.amount,
    req.fee && req.fee.paid ? 'paid' : (fee.amount ? 'outstanding' : 'no fee'));

  const holds = ctx.holds || [];
  push('No open compliance hold', holds.length === 0,
    holds.length ? holds.join('; ') : 'none');

  const priors = ctx.priorRequests || [];
  const firstTime = priors.length === 0;
  push('Applicant has prior history', !firstTime,
    firstTime ? 'first application from this applicant' : `${priors.length} prior applications`);

  const blocking = gates.filter((g) => !g.passed && g.gate !== 'Applicant has prior history');
  const passedCount = gates.filter((g) => g.passed).length;
  const confidence = clamp01(passedCount / gates.length - (firstTime ? 0.15 : 0));

  return {
    action: blocking.length ? 'Held an application at a gate' : 'Adjudicated an application as eligible',
    subject: { type: 'ServiceRequest', id: String(req._id), label: `${req.requestNo} — ${req.serviceName}` },
    inputs: { service: req.serviceCode, status: req.status, stage: req.currentStage },
    output: {
      eligible: blocking.length === 0,
      gates: gates.map((g) => ({ gate: g.gate, passed: g.passed, detail: g.detail })),
      recommendation: blocking.length ? 'ESCALATE' : 'APPROVE',
    },
    explanation: blocking.length
      ? `Held at ${blocking.length} gate(s): ${blocking.map((g) => `${g.gate} — ${g.detail}`).join('; ')}.`
      : `All ${gates.length} eligibility gates pass${firstTime ? ', but this is a first-time applicant so it is put to an officer' : ' — eligible for zero-touch issue'}.`,
    factors: gates.map((g) => factor(g.gate, round(1 / gates.length, 2), g.passed ? 'pass' : 'fail',
      g.passed ? 1 / gates.length : 0)),
    confidence: round(confidence, 3),
  };
}

/* ================================================= A4 — customer guidance */
/* Turns the internal state of an application into the answer the applicant
 * actually wants: where it is, what happens next, and what they must do. */
function customerGuidance(req, def, now = new Date()) {
  const stages = (def && def.stages) || [];
  const idx = stages.findIndex((s) => s.key === req.currentStage);
  const next = idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  const sla = (def && def.slaDays) || 0;
  const lodged = req.submittedAt || req.createdAt;
  const elapsed = lodged ? days(lodged, now) : 0;
  const remaining = sla ? sla - elapsed : null;

  const required = (def && def.requiredDocuments) || [];
  const byKey = new Map((req.documents || []).map((d) => [d.key, d]));
  const outstanding = required.filter((r) => r.mandatory && !byKey.has(r.key)).map((r) => r.label);

  const actionable = req.status === 'INFO_REQUESTED' || outstanding.length > 0;
  const message = req.status === 'ISSUED'
    ? `Your ${req.serviceName} has been issued. The instrument is on the register and can be verified publicly.`
    : req.status === 'REJECTED'
      ? `This application was refused. ${req.decision?.reason || 'The reason is recorded on the file.'}`
      : outstanding.length
        ? `We are waiting on ${outstanding.length} document(s): ${outstanding.join(', ')}. The application resumes as soon as they are lodged.`
        : `Your application is at the ${req.currentStage || 'first'} stage${next ? `, and moves to ${next.label} next` : ''}.${
          remaining != null ? ` The service level allows ${sla} days; ${remaining >= 0 ? `${remaining} remain` : `it is ${-remaining} days over`}.` : ''}`;

  return {
    action: actionable ? 'Told an applicant what is outstanding' : 'Answered an application status enquiry',
    subject: { type: 'ServiceRequest', id: String(req._id), label: req.requestNo },
    inputs: { status: req.status, stage: req.currentStage, slaDays: sla, elapsedDays: elapsed },
    output: { message, outstanding, nextStage: next ? next.label : null, slaRemainingDays: remaining },
    explanation: message,
    factors: [
      factor('Application state known', 0.4, req.status, 0.4),
      factor('Service definition matched', 0.3, def ? def.code : 'none', def ? 0.3 : 0),
      factor('Outstanding items identified', 0.3, String(outstanding.length), 0.3),
    ],
    confidence: round(def ? 0.92 : 0.55, 3),
  };
}

/* ================================================== A5 — smart inspection */
/* Builds the pre-boarding picture: how risky this ship is before anyone drives
 * out to it, and which deficiency categories its own history says to look at. */
function smartInspection(vessel, ctx = {}, now = new Date()) {
  const inspections = ctx.inspections || [];
  const compliance = vesselCompliance(vessel, ctx, now);
  const score = compliance.output.score;

  // what this ship has actually been written up for before
  const counts = new Map();
  inspections.forEach((i) => (i.findings || []).forEach((f) => {
    const k = f.deficiencyCode || f.category || 'Unclassified';
    counts.set(k, (counts.get(k) || 0) + 1);
  }));
  const predicted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([code, n]) => ({ code, priorOccurrences: n }));

  const last = inspections.map((i) => i.date || i.createdAt).filter(Boolean).sort().pop();
  const gapDays = last ? days(last, now) : 400;
  const due = gapDays > 180;
  const target = score >= 55 || due;

  return {
    action: target ? 'Selected a vessel for boarding' : 'Assessed a vessel as not requiring boarding',
    subject: { type: 'Vessel', id: String(vessel._id), label: `${vessel.name} (IMO ${vessel.imo})` },
    inputs: { priorInspections: inspections.length, daysSinceLast: gapDays },
    output: {
      board: target, riskScore: score, band: compliance.output.band,
      predictedDeficiencies: predicted,
      dossier: {
        vessel: vessel.name, imo: vessel.imo, flag: vessel.flag, type: vessel.type,
        built: vessel.built, classSociety: vessel.classSociety,
        expiredCertificates: compliance.output.expired,
        openFindings: inspections.reduce((t, i) => t + (i.findings || []).filter((f) => !f.closedAt).length, 0),
      },
    },
    explanation: target
      ? `Boarding recommended: risk ${score}/100 (${compliance.output.band.toLowerCase()}), ${gapDays} days since the last inspection.${
        predicted.length ? ` Prior history points at ${predicted.map((p) => p.code).join(', ')}.` : ''}`
      : `No boarding recommended: risk ${score}/100 and inspected ${gapDays} days ago.`,
    factors: [
      ...compliance.factors,
      factor('Time since last inspection', 10, `${gapDays} days`, clamp01(gapDays / 365) * 10),
    ],
    confidence: round(clamp01(0.5 + (inspections.length / 8) * 0.45), 3),
  };
}

/* ============================================= A6 — regulatory intelligence */
/* Watches the instrument library: what has just come into force, what it
 * displaces, and which services and stakeholders it lands on. */
function regulatoryIntelligence(instrument, ctx = {}, now = new Date()) {
  const all = ctx.instruments || [];
  const services = ctx.services || [];
  const ref = (i) => i.refNo || i.type;

  // `supersedes` holds the refNo of the instrument this one replaces, so the
  // chain is walked by reference in both directions: what this one replaced,
  // and what has since replaced it.
  const replaced = all.filter((i) => instrument.supersedes
    && String(i.refNo) === String(instrument.supersedes));
  const replacedBy = all.filter((i) => String(i.supersedes || '') === String(instrument.refNo));

  // an instrument still in force, on the same subject, that nothing supersedes
  // Same type and same category, not merely a shared naming convention. Title
  // overlap alone flags every instrument in a series called "Merchant Shipping
  // (...) Rules" against every other, which is noise rather than a finding.
  const sameSubject = all.filter((i) => String(i._id) !== String(instrument._id)
    && i.status === 'IN_FORCE'
    && i.type === instrument.type
    && String(i.category || '') === String(instrument.category || '')
    && overlapWords(i.title, instrument.title) >= 2);

  // which services this instrument plausibly bears on, by subject overlap
  const affected = services.filter((s) => overlapWords(s.name, instrument.title) >= 1
    || (instrument.tags || []).some((t) => String(s.code || '').toLowerCase().includes(String(t).toLowerCase())));

  const effective = instrument.effectiveDate || instrument.issuedDate;
  const ageDays = effective ? days(effective, now) : null;
  const isNew = ageDays != null && ageDays >= 0 && ageDays <= 30;
  const conflict = sameSubject.length > 0 && replaced.length === 0 && replacedBy.length === 0;
  const superseded = instrument.status === 'SUPERSEDED' && replacedBy.length === 0;

  return {
    action: conflict ? 'Flagged a possible regulatory conflict'
      : superseded ? 'Flagged a superseded instrument with no replacement recorded'
        : (isNew ? 'Analysed a newly effective instrument' : 'Reviewed an instrument in force'),
    subject: { type: 'Instrument', id: String(instrument._id), label: `${ref(instrument)} — ${instrument.title}` },
    inputs: { type: instrument.type, status: instrument.status, effectiveDate: effective },
    output: {
      newlyEffective: isNew,
      supersedes: replaced.map(ref),
      supersededBy: replacedBy.map(ref),
      possibleConflicts: sameSubject.map(ref),
      affectedServices: affected.map((s) => s.code),
      acknowledgementRequired: !!instrument.ackRequired,
    },
    explanation: conflict
      ? `In force alongside ${sameSubject.length} other instrument(s) on the same subject with no supersession recorded — ${sameSubject.map(ref).join(', ')}. A gap or conflict may exist.`
      : superseded
        ? `Marked superseded but no replacing instrument names it, so the chain is broken and "which version applies?" cannot be answered from the register.`
        : `${isNew ? `Effective ${ageDays} days ago. ` : ''}${replaced.length ? `Supersedes ${replaced.map(ref).join(', ')}. ` : ''}${replacedBy.length ? `Superseded by ${replacedBy.map(ref).join(', ')}. ` : ''}Bears on ${affected.length} service(s)${affected.length ? `: ${affected.slice(0, 4).map((s) => s.code).join(', ')}` : ''}.`,
    factors: [
      factor('Recency', 0.3, ageDays == null ? 'unknown' : `${ageDays} days`, isNew ? 0.3 : 0.1),
      factor('Supersession chain intact', 0.3,
        (replaced.length || replacedBy.length) ? 'linked'
          : instrument.status === 'SUPERSEDED' ? 'broken'
            : conflict ? 'not recorded' : 'none needed',
        (replaced.length || replacedBy.length) ? 0.3
          : (instrument.status === 'SUPERSEDED' || conflict) ? 0 : 0.2),
      factor('Services affected', 0.25, String(affected.length), clamp01(affected.length / 4) * 0.25),
      factor('Competing instruments', 0.15, String(sameSubject.length), conflict ? 0.15 : 0.15),
    ],
    confidence: round(clamp01(0.55 + (affected.length ? 0.2 : 0)
      + ((replaced.length || replacedBy.length) ? 0.15 : 0)
      + (ageDays != null ? 0.1 : 0)), 3),
  };
}

const STOP = new Set(['the', 'of', 'and', 'for', 'a', 'an', 'in', 'on', 'at', 'to', 'by', 'port', 'vessel', 'ship']);
function overlapWords(a, b) {
  const norm = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w)));
  const A = norm(a); const B = norm(b);
  let n = 0;
  A.forEach((w) => { if (B.has(w)) n += 1; });
  return n;
}

/* ========================================= A7 — national maritime intelligence */
/* Synthesises the operating picture into the few things a duty officer should
 * act on now, rather than a dashboard nobody reads. */
function maritimeIntelligence(ctx = {}, now = new Date()) {
  const vessels = ctx.vessels || [];
  const incidents = ctx.incidents || [];
  const inspections = ctx.inspections || [];

  const openIncidents = incidents.filter((i) => !['RESOLVED', 'CLOSED'].includes(i.status));
  const severe = openIncidents.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity));
  const expiredCerts = vessels.reduce((t, v) => t
    + (v.certificates || []).filter((c) => new Date(c.expiryDate) < now).length, 0);
  const vesselsWithExpired = vessels.filter((v) => (v.certificates || [])
    .some((c) => new Date(c.expiryDate) < now));
  const detentions90 = inspections.filter((i) => {
    if (i.result !== 'DETAINED') return false;
    const when = i.startedAt || i.closedAt || i.createdAt; // the record's own dates
    return when && days(when, now) <= 90;
  }).length;

  const anomalies = [];
  if (severe.length) anomalies.push(`${severe.length} open incident(s) at high or critical severity`);
  if (vesselsWithExpired.length) anomalies.push(`${vesselsWithExpired.length} vessel(s) carrying an expired certificate`);
  if (detentions90 >= 3) anomalies.push(`${detentions90} detentions in the last 90 days`);

  const level = severe.length >= 3 || detentions90 >= 5 ? 'ELEVATED'
    : anomalies.length ? 'WATCH' : 'NORMAL';

  return {
    action: level === 'NORMAL' ? 'Published the maritime situation report' : 'Raised the maritime picture to ' + level.toLowerCase(),
    subject: { type: 'Situation', id: 'national', label: 'National maritime picture' },
    inputs: { vessels: vessels.length, openIncidents: openIncidents.length, inspections: inspections.length },
    output: {
      level,
      openIncidents: openIncidents.length,
      severeIncidents: severe.length,
      vesselsWithExpiredCertificates: vesselsWithExpired.length,
      expiredCertificates: expiredCerts,
      detentionsLast90Days: detentions90,
      anomalies,
    },
    explanation: anomalies.length
      ? `Picture at ${level}: ${anomalies.join('; ')}.`
      : `Picture normal: ${openIncidents.length} open incidents, no certificate or detention concentrations.`,
    factors: [
      factor('Severe open incidents', 0.35, String(severe.length), clamp01(severe.length / 3) * 0.35),
      factor('Vessels with expired certificates', 0.35, String(vesselsWithExpired.length), clamp01(vesselsWithExpired.length / 5) * 0.35),
      factor('Recent detentions', 0.30, String(detentions90), clamp01(detentions90 / 5) * 0.30),
    ],
    confidence: round(clamp01(0.7 + (vessels.length ? 0.2 : 0) + (inspections.length ? 0.1 : 0)), 3),
  };
}

module.exports = {
  imoCheckDigitValid, issuerRecognised,
  documentIntelligence, vesselCompliance, serviceProcessing,
  customerGuidance, smartInspection, regulatoryIntelligence, maritimeIntelligence,
};
