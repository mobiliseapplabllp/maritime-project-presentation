const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/domain/maritimeAgents');

const NOW = new Date('2026-08-28T00:00:00Z');
const day = (n) => new Date(NOW.getTime() + n * 86400000);

/* ------------------------------------------------------- identifier checks */

test('agents: an IMO number is accepted only if its own check digit agrees', () => {
  // 9074729 is a well-formed IMO: 9*7+0*6+7*5+4*4+7*3+2*2 = 63+0+35+16+21+4 = 139 -> 9
  assert.equal(A.imoCheckDigitValid('9074729'), true);
  assert.equal(A.imoCheckDigitValid('9074728'), false, 'a wrong check digit must be refused');
  assert.equal(A.imoCheckDigitValid('907472'), false, 'six digits is not an IMO number');
  assert.equal(A.imoCheckDigitValid(''), false);
});

test('agents: an unrecognised issuing authority is not treated as recognised', () => {
  assert.equal(A.issuerRecognised('Directorate General of Shipping'), true);
  assert.equal(A.issuerRecognised('Lloyd\'s Register'), true);
  assert.equal(A.issuerRecognised('Some Unknown Bureau'), false);
  assert.equal(A.issuerRecognised(''), false);
});

/* --------------------------------------------------- A1 document intelligence */

const defWith = (docs) => ({ code: 'X', requiredDocuments: docs, stages: [], slaDays: 10 });

test('A1: a complete, verified, coherent file passes with high confidence', () => {
  const def = defWith([
    { key: 'doc1', label: 'Certificate of Registry', mandatory: true },
    { key: 'doc2', label: 'Insurance', mandatory: true },
  ]);
  const req = {
    _id: 'r1', requestNo: 'SR-1', serviceCode: 'X',
    documents: [{ key: 'doc1', verified: true }, { key: 'doc2', verified: true }],
  };
  const vessel = { imo: '9074729', certificates: [{ issuer: 'DNV', issueDate: day(-500), expiryDate: day(500) }] };
  const r = A.documentIntelligence(req, def, vessel, NOW);
  assert.equal(r.output.complete, true);
  assert.equal(r.output.failedChecks.length, 0);
  assert.ok(r.confidence > 0.9, `expected high confidence, got ${r.confidence}`);
});

test('A1: a missing mandatory document is reported by name and drops confidence', () => {
  const def = defWith([
    { key: 'doc1', label: 'Certificate of Registry', mandatory: true },
    { key: 'doc2', label: 'Insurance', mandatory: true },
  ]);
  const req = { _id: 'r1', requestNo: 'SR-1', documents: [{ key: 'doc1', verified: true }] };
  const r = A.documentIntelligence(req, def, null, NOW);
  assert.equal(r.output.complete, false);
  assert.deepEqual(r.output.missing, ['Insurance']);
  assert.ok(r.confidence < 0.8, 'an incomplete file must not look confident');
});

test('A1: a certificate that expires before it was issued is caught', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = { _id: 'r1', requestNo: 'SR-1', documents: [{ key: 'doc1', verified: true }] };
  const vessel = { imo: '9074729', certificates: [{ issuer: 'DNV', issueDate: day(10), expiryDate: day(-10) }] };
  const r = A.documentIntelligence(req, def, vessel, NOW);
  assert.ok(r.output.failedChecks.some((c) => c.startsWith('Date coherence')),
    'an incoherent certificate must fail the date check');
});

test('A1: a bad IMO check digit fails validation even when the paperwork is complete', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = { _id: 'r1', requestNo: 'SR-1', documents: [{ key: 'doc1', verified: true }] };
  const r = A.documentIntelligence(req, def, { imo: '9074728', certificates: [] }, NOW);
  assert.ok(r.output.failedChecks.some((c) => c.startsWith('IMO check digit')));
});

/* ------------------------------------------------------ A2 vessel compliance */

test('A2: a certificate in date but with an overdue survey is reported as not in force', () => {
  const vessel = { _id: 'v1', name: 'MV Test', imo: '9074729', built: 2015, certificates: [] };
  // issued three years ago on a five-year term, with no endorsements recorded
  const instrument = {
    _id: 'i1', entityType: 'CARGO_SHIP_SAFETY_EQUIPMENT', status: 'ISSUED',
    issueDate: day(-1095), expiryDate: day(730), endorsements: [],
  };
  const r = A.vesselCompliance(vessel, { inspections: [], instruments: [instrument] }, NOW);
  assert.ok(r.output.notInForce.length > 0, 'an unendorsed statutory certificate is not in force');
  assert.match(r.action, /not in force/);
});

test('A2: detentions and expired certificates push the risk band up', () => {
  const vessel = {
    _id: 'v1', name: 'MV Test', imo: '9074729', built: 1998,
    certificates: [{ expiryDate: day(-5) }, { expiryDate: day(-30) }, { expiryDate: day(400) }],
  };
  const inspections = [
    { result: 'DETAINED', date: day(-40), findings: [{}, {}, {}, {}] },
    { result: 'DEFICIENCIES', date: day(-200), findings: [{}, {}, {}] },
  ];
  const r = A.vesselCompliance(vessel, { inspections, instruments: [] }, NOW);
  assert.ok(r.output.score >= 35, `expected an elevated score, got ${r.output.score}`);
  assert.notEqual(r.output.band, 'LOW');
  assert.equal(r.factors.length, 6, 'every weighted factor must be shown');
});

/* ----------------------------------------------------- A3 service processing */

test('A3: an application clearing every gate is recommended for approval', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = {
    _id: 'r1', requestNo: 'SR-1', serviceName: 'Navigation licence', status: 'UNDER_ASSESSMENT',
    documents: [{ key: 'doc1', verified: true }], fee: { paid: true },
  };
  const r = A.serviceProcessing(req, def, { _id: 's1' }, { holds: [], priorRequests: [1, 2] }, NOW);
  assert.equal(r.output.eligible, true);
  assert.equal(r.output.recommendation, 'APPROVE');
});

test('A3: a first-time applicant is still put to an officer even when the gates pass', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = {
    _id: 'r1', requestNo: 'SR-1', serviceName: 'X', status: 'SUBMITTED',
    documents: [{ key: 'doc1', verified: true }], fee: { paid: true },
  };
  const withHistory = A.serviceProcessing(req, def, { _id: 's1' }, { priorRequests: [1] }, NOW);
  const firstTime = A.serviceProcessing(req, def, { _id: 's1' }, { priorRequests: [] }, NOW);
  assert.ok(firstTime.confidence < withHistory.confidence,
    'a first-time applicant must not be as confidently auto-approved');
  assert.match(firstTime.explanation, /first-time applicant/);
});

test('A3: an open compliance hold blocks the application and names the reason', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = { _id: 'r1', requestNo: 'SR-1', documents: [{ key: 'doc1', verified: true }], fee: { paid: true } };
  const r = A.serviceProcessing(req, def, { _id: 's1' }, { holds: ['subject is suspended on the register'] }, NOW);
  assert.equal(r.output.eligible, false);
  assert.equal(r.output.recommendation, 'ESCALATE');
  assert.match(r.explanation, /suspended on the register/);
});

/* ------------------------------------------------------- A5 smart inspection */

test('A5: prior deficiency history drives what the dossier says to look at', () => {
  const vessel = { _id: 'v1', name: 'MV Test', imo: '9074729', built: 2001, certificates: [] };
  const inspections = [
    { result: 'DEFICIENCIES', date: day(-300), findings: [{ deficiencyCode: 'FIRE' }, { deficiencyCode: 'FIRE' }, { deficiencyCode: 'LSA' }] },
    { result: 'DETAINED', date: day(-500), findings: [{ deficiencyCode: 'FIRE' }, { deficiencyCode: 'ISM' }] },
  ];
  const r = A.smartInspection(vessel, { inspections, instruments: [] }, NOW);
  assert.equal(r.output.predictedDeficiencies[0].code, 'FIRE');
  assert.equal(r.output.predictedDeficiencies[0].priorOccurrences, 3);
  assert.equal(r.output.board, true, 'a high-risk, long-uninspected ship is a boarding target');
  assert.ok(r.output.dossier.imo, 'the dossier must carry the ship it is about');
});

test('A5: a recently inspected, low-risk ship is not selected for boarding', () => {
  const vessel = { _id: 'v1', name: 'MV New', imo: '9074729', built: 2024, certificates: [{ expiryDate: day(900) }] };
  const inspections = [{ result: 'SATISFACTORY', date: day(-20), findings: [] }];
  const r = A.smartInspection(vessel, { inspections, instruments: [] }, NOW);
  assert.equal(r.output.board, false);
});

/* ------------------------------------------------ A6 regulatory intelligence */

test('A6: two instruments in force on the same subject with no supersession is flagged', () => {
  const a = { _id: 'i1', type: 'CIRCULAR', status: 'IN_FORCE', refNo: 'CIRC-01', title: 'Garbage reception charges under MARPOL Annex' };
  const b = { _id: 'i2', type: 'CIRCULAR', status: 'IN_FORCE', refNo: 'CIRC-02', title: 'Revised garbage reception charges MARPOL Annex' };
  const r = A.regulatoryIntelligence(b, { instruments: [a, b], services: [] }, NOW);
  assert.ok(r.output.possibleConflicts.includes('CIRC-01'));
  assert.match(r.action, /conflict/);
});

// `supersedes` on the model is the refNo of the instrument being replaced — a
// String, not a list of ids. The agent and these tests both used to assume an
// array of ids, which is why a broken chain went undetected on real records.
test('A6: an instrument that records what it supersedes is not flagged as a conflict', () => {
  const a = { _id: 'i1', type: 'CIRCULAR', status: 'SUPERSEDED', refNo: 'CIRC-01', title: 'Garbage reception charges MARPOL Annex' };
  const b = {
    _id: 'i2', type: 'CIRCULAR', status: 'IN_FORCE', refNo: 'CIRC-02',
    title: 'Revised garbage reception charges MARPOL Annex', supersedes: 'CIRC-01', effectiveDate: day(-10),
  };
  const r = A.regulatoryIntelligence(b, { instruments: [a, b], services: [] }, NOW);
  assert.deepEqual(r.output.supersedes, ['CIRC-01']);
  assert.equal(r.output.possibleConflicts.length, 0);
  assert.equal(r.output.newlyEffective, true);
});

test('A6: the superseded instrument sees the chain from its own end', () => {
  const a = { _id: 'i1', type: 'CIRCULAR', status: 'SUPERSEDED', refNo: 'CIRC-01', title: 'Garbage reception charges MARPOL Annex' };
  const b = {
    _id: 'i2', type: 'CIRCULAR', status: 'IN_FORCE', refNo: 'CIRC-02',
    title: 'Revised garbage reception charges MARPOL Annex', supersedes: 'CIRC-01', effectiveDate: day(-10),
  };
  const r = A.regulatoryIntelligence(a, { instruments: [a, b], services: [] }, NOW);
  assert.deepEqual(r.output.supersededBy, ['CIRC-02']);
  assert.doesNotMatch(r.action, /no replacement/);
});

test('A6: a superseded instrument nothing replaces is reported as a broken chain', () => {
  const a = { _id: 'i1', type: 'CIRCULAR', status: 'SUPERSEDED', refNo: 'CIRC-01',
    title: 'Garbage reception charges MARPOL Annex', effectiveDate: day(-400) };
  const r = A.regulatoryIntelligence(a, { instruments: [a], services: [] }, NOW);
  assert.match(r.action, /no replacement recorded/);
  assert.equal(r.factors.find((f) => f.factor === 'Supersession chain intact').value, 'broken');
});

test('A6: reads the effective date the model actually carries', () => {
  const i = { _id: 'i1', type: 'NOTICE', status: 'IN_FORCE', refNo: 'N-01', title: 'Navigational warning',
    effectiveDate: day(-5) };
  const r = A.regulatoryIntelligence(i, { instruments: [i], services: [] }, NOW);
  assert.equal(r.output.newlyEffective, true);
  assert.equal(r.factors.find((f) => f.factor === 'Recency').value, '5 days');
});

/* --------------------------------------------- A7 national maritime picture */

test('A7: concentrations of severe incidents and expired certificates raise the level', () => {
  const vessels = Array.from({ length: 6 }, (_, i) => ({
    _id: `v${i}`, certificates: [{ expiryDate: day(-10) }],
  }));
  const incidents = Array.from({ length: 4 }, (_, i) => ({ _id: `i${i}`, status: 'OPEN', severity: 'CRITICAL' }));
  const r = A.maritimeIntelligence({ vessels, incidents, inspections: [] }, NOW);
  assert.equal(r.output.level, 'ELEVATED');
  assert.equal(r.output.vesselsWithExpiredCertificates, 6);
  assert.ok(r.output.anomalies.length >= 2);
});

test('A7: a detention is counted from the inspection record\'s real dates, inside the window only', () => {
  const insp = (d, result) => ({ result, status: 'CLOSED', startedAt: day(d), closedAt: day(d) });
  const r = A.maritimeIntelligence({
    vessels: [{ _id: 'v1', certificates: [{ expiryDate: day(400) }] }],
    incidents: [],
    inspections: [insp(-30, 'DETAINED'), insp(-400, 'DETAINED'), insp(-20, 'SATISFACTORY')],
  }, NOW);
  assert.equal(r.output.detentionsLast90Days, 1, 'only the detention inside 90 days counts');
  const f = r.factors.find((x) => x.factor === 'Recent detentions');
  assert.ok(f, 'the factor must be reported even when small');
});

test('A7: a detention concentration is named as an anomaly and can raise the level alone', () => {
  const insp = (d) => ({ result: 'DETAINED', status: 'CLOSED', startedAt: day(d), closedAt: day(d) });
  const quiet = { vessels: [{ _id: 'v1', certificates: [{ expiryDate: day(400) }] }], incidents: [] };
  const watch = A.maritimeIntelligence({ ...quiet, inspections: [insp(-10), insp(-40), insp(-70)] }, NOW);
  assert.equal(watch.output.detentionsLast90Days, 3);
  assert.ok(watch.output.anomalies.some((a) => a.includes('detention')), 'three in the window is an anomaly');
  assert.equal(watch.output.level, 'WATCH');
  const elevated = A.maritimeIntelligence({ ...quiet,
    inspections: [insp(-10), insp(-25), insp(-40), insp(-55), insp(-70)] }, NOW);
  assert.equal(elevated.output.level, 'ELEVATED', 'five recent detentions elevate the picture on their own');
});

test('A7: a quiet picture reports normal rather than inventing a concern', () => {
  const r = A.maritimeIntelligence({
    vessels: [{ _id: 'v1', certificates: [{ expiryDate: day(400) }] }],
    incidents: [{ _id: 'i1', status: 'CLOSED', severity: 'LOW' }],
    inspections: [{ result: 'SATISFACTORY', status: 'CLOSED', startedAt: day(-10), closedAt: day(-10) }],
  }, NOW);
  assert.equal(r.output.level, 'NORMAL');
  assert.equal(r.output.anomalies.length, 0);
});

/* -------------------------------------------------------- shape contract --- */

test('agents: every judgement carries an explanation, weighted factors and a bounded confidence', () => {
  const def = defWith([{ key: 'doc1', label: 'Registry', mandatory: true }]);
  const req = { _id: 'r1', requestNo: 'SR-1', documents: [{ key: 'doc1', verified: true }], fee: { paid: true } };
  const vessel = { _id: 'v1', name: 'MV Test', imo: '9074729', built: 2010, certificates: [] };
  const judgements = [
    A.documentIntelligence(req, def, vessel, NOW),
    A.vesselCompliance(vessel, {}, NOW),
    A.serviceProcessing(req, def, vessel, {}, NOW),
    A.customerGuidance(req, def, NOW),
    A.smartInspection(vessel, {}, NOW),
    A.regulatoryIntelligence({ _id: 'i1', type: 'CIRCULAR', status: 'IN_FORCE', title: 'X' }, {}, NOW),
    A.maritimeIntelligence({}, NOW),
  ];
  for (const j of judgements) {
    assert.ok(j.action && j.action.length > 5, 'an action must say what was decided');
    assert.ok(j.explanation && j.explanation.length > 10, 'every decision must explain itself');
    assert.ok(Array.isArray(j.factors) && j.factors.length, 'weighted factors are required for explainability');
    assert.ok(j.confidence >= 0 && j.confidence <= 1, `confidence out of range: ${j.confidence}`);
    j.factors.forEach((f) => {
      assert.ok(f.factor && f.weight !== undefined && f.contribution !== undefined,
        'each factor needs a name, a weight and a contribution');
    });
  }
});

/* ------------------------------------------- publication governance (D3) */

const G = require('../src/domain/legislationGovernance');

test('governance: a draft can be put in force, and a superseded instrument cannot', () => {
  assert.equal(G.canTransition('DRAFT', 'IN_FORCE').ok, true);
  assert.equal(G.canTransition('DRAFT', 'WITHDRAWN').ok, true);
  assert.equal(G.canTransition('IN_FORCE', 'SUPERSEDED').ok, true);
  assert.equal(G.canTransition('SUPERSEDED', 'IN_FORCE').ok, false);
  assert.match(G.canTransition('SUPERSEDED', 'IN_FORCE').error, /final/);
});

test('governance: the register cannot be walked backwards', () => {
  assert.equal(G.canTransition('IN_FORCE', 'DRAFT').ok, false);
  assert.equal(G.canTransition('WITHDRAWN', 'IN_FORCE').ok, false);
  assert.equal(G.canTransition('IN_FORCE', 'IN_FORCE').ok, false);
});

test('governance: an instrument cannot be approved by the person who drafted it', () => {
  const draft = { status: 'DRAFT', draftedBy: 'u1' };
  const self = G.canApprove(draft, 'u1');
  assert.equal(self.ok, false);
  assert.match(self.error, /cannot be approved by the person who drafted it/);
  assert.equal(G.canApprove(draft, 'u2').ok, true);
});

test('governance: approval is refused when no drafter is recorded', () => {
  const r = G.canApprove({ status: 'DRAFT' }, 'u2');
  assert.equal(r.ok, false);
  assert.match(r.error, /separation of duties/);
});

test('governance: only a draft can be approved', () => {
  assert.equal(G.canApprove({ status: 'IN_FORCE', draftedBy: 'u1' }, 'u2').ok, false);
  assert.equal(G.canApprove({ status: 'WITHDRAWN', draftedBy: 'u1' }, 'u2').ok, false);
});
