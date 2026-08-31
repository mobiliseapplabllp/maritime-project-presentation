const test = require('node:test');
const assert = require('node:assert/strict');

const R = require('../src/domain/vesselRegistry');
const SC = require('../src/domain/statutoryCertificates');
const Sign = require('../src/domain/certificateSigning');
const { REGISTRATION_TRANSITIONS } = require('../src/config/constants');

/* B1 — the rules that decide whether a ship gets a nationality. Every one of
 * these is a statutory condition rather than a preference, so each is tested on
 * its own rather than through the controller that happens to call it. */

const OWNER = { name: 'Kutch Coastal Shipping Ltd', kind: 'BODY_CORPORATE', cin: 'U61100GJ2016PLC012345', shares: 10 };
const VESSEL = { name: 'MV Test', imo: '9700099', grt: 20000, status: 'ACTIVE' };
const FULL_EVIDENCE = [
  { key: 'DECLARATION_OF_OWNERSHIP', verified: true },
  { key: 'TITLE_DOCUMENT', verified: true },
  { key: 'TONNAGE_CERTIFICATE', verified: true },
  { key: 'SURVEY_CERTIFICATE', verified: true },
];
const permanent = (over = {}) => ({
  kind: 'PERMANENT', portOfRegistry: 'KDL', owners: [OWNER],
  tonnage: { gross: 20000, net: 11000, certificateNo: 'TM/9700099' },
  evidence: FULL_EVIDENCE,
  carvingNote: { compliedOn: new Date('2026-01-10'), surveyor: 'A Surveyor' },
  ...over,
});
const failing = (checks) => R.blocking(checks).map((c) => c.check);

test('registration: a complete permanent application clears every blocking check', () => {
  const checks = R.registrationChecks(permanent(), VESSEL, { onRegister: false });
  assert.deepEqual(failing(checks), []);
});

test('registration: a ship already on the register cannot be registered again', () => {
  const checks = R.registrationChecks(permanent(), VESSEL, { onRegister: true });
  assert.ok(failing(checks).includes('Ship is not already on the register'));
});

test('registration: an amendment or closure needs a subsisting entry', () => {
  for (const kind of ['AMENDMENT', 'DELETION']) {
    const checks = R.registrationChecks({ kind, portOfRegistry: 'KDL', evidence: [] }, VESSEL, { onRegister: false });
    assert.ok(failing(checks).includes('Ship holds a subsisting registry entry'), `${kind} must require an entry`);
  }
});

test('registration: shares must account for the whole ship and no more', () => {
  const den = R.shareRules().denominator;
  const short = R.registrationChecks(permanent({ owners: [{ ...OWNER, shares: den - 1 }] }), VESSEL, {});
  assert.ok(failing(short).includes('Ownership shares account for the whole ship'));

  const over = R.registrationChecks(permanent({ owners: [{ ...OWNER, shares: den + 1 }] }), VESSEL, {});
  assert.ok(failing(over).includes('Ownership shares account for the whole ship'));

  const split = R.shareLedger([{ shares: den - 3 }, { shares: 3 }]);
  assert.equal(split.balanced, true);
  assert.equal(split.held, den);
});

test('registration: more registered owners than the statute allows is refused', () => {
  const { denominator, maxOwners } = R.shareRules();
  const many = Array.from({ length: maxOwners + 1 }, (_, i) => ({
    ...OWNER, name: `Owner ${i}`, shares: i === 0 ? denominator - maxOwners : 1,
  }));
  const checks = R.registrationChecks(permanent({ owners: many }), VESSEL, {});
  assert.ok(failing(checks).includes('Registered owners within the statutory maximum'));
});

test('registration: nationality qualifies a body corporate on its Indian registration, an individual on citizenship', () => {
  assert.equal(R.qualifies({ kind: 'BODY_CORPORATE', cin: 'U61100GJ2016PLC012345' }).ok, true);
  assert.equal(R.qualifies({ kind: 'BODY_CORPORATE', name: 'Offshore Holdings SA' }).ok, false);
  assert.equal(R.qualifies({ kind: 'INDIVIDUAL', name: 'A Patel', nationality: 'Indian' }).ok, true);
  assert.equal(R.qualifies({ kind: 'INDIVIDUAL', name: 'B Smith', nationality: 'British' }).ok, false);
  assert.equal(R.qualifies({ kind: 'COOPERATIVE_SOCIETY', cin: 'GJ/COOP/2011/004' }).ok, true);

  const foreign = R.registrationChecks(permanent({ owners: [{ kind: 'INDIVIDUAL', name: 'B Smith', nationality: 'British', shares: 10 }] }), VESSEL, {});
  assert.ok(failing(foreign).includes('Every owner qualifies to own an Indian ship'));
});

test('registration: the port of registry must be a declared port', () => {
  const checks = R.registrationChecks(permanent({ portOfRegistry: 'ZZZ' }), VESSEL, {});
  assert.ok(failing(checks).includes('Port of registry is a declared port'));
  assert.equal(R.isKnownPort('KDL'), true);
  assert.equal(R.portName('MUM'), 'Mumbai');
});

test('registration: a permanent certificate waits on the carving and marking report', () => {
  const notCarved = R.registrationChecks(permanent({ carvingNote: { issuedOn: new Date() } }), VESSEL, {});
  assert.ok(failing(notCarved).includes('Carving and marking note complied with'));
  // a provisional certificate has nothing to carve, so the check does not apply
  const provisional = R.registrationChecks(
    { kind: 'PROVISIONAL', portOfRegistry: 'KDL', owners: [OWNER], tonnage: {}, evidence: FULL_EVIDENCE.slice(0, 2) },
    VESSEL, { onRegister: false },
  );
  assert.equal(provisional.some((c) => c.check === 'Carving and marking note complied with'), false);
  assert.deepEqual(failing(provisional), []);
});

test('registration: conditional evidence is only demanded where it applies', () => {
  const indian = R.requiredEvidence(permanent()).map((e) => e.key);
  assert.equal(indian.includes('DELETION_CERTIFICATE'), false);

  const reflagged = R.requiredEvidence(permanent({ previousFlag: 'Panama' })).map((e) => e.key);
  assert.ok(reflagged.includes('DELETION_CERTIFICATE'));

  const renaming = R.requiredEvidence({ kind: 'AMENDMENT', amendment: { types: ['NAME'] } }).map((e) => e.key);
  assert.ok(renaming.includes('NAME_APPROVAL'));
  const remanaging = R.requiredEvidence({ kind: 'AMENDMENT', amendment: { types: ['MANAGER'] } }).map((e) => e.key);
  assert.equal(remanaging.includes('NAME_APPROVAL'), false);
});

test('registration: a name change needs prior approval', () => {
  const doc = {
    kind: 'AMENDMENT', portOfRegistry: 'KDL',
    amendment: { types: ['NAME'] },
    evidence: [{ key: 'AMENDMENT_APPLICATION' }, { key: 'SUPPORTING_EVIDENCE' }, { key: 'NAME_APPROVAL' }],
  };
  assert.ok(failing(R.registrationChecks(doc, VESSEL, { onRegister: true })).includes('New name approved in advance'));
  doc.amendment.approvalReference = 'DGS/NAME/2026/0412';
  assert.equal(failing(R.registrationChecks(doc, VESSEL, { onRegister: true })).includes('New name approved in advance'), false);
});

test('registration: nothing leaves the register owing money or carrying a mortgage', () => {
  const base = {
    kind: 'DELETION', portOfRegistry: 'KDL',
    deletion: { reason: 'SOLD_FOREIGN', newFlag: 'Panama' },
    evidence: [{ key: 'CLOSURE_APPLICATION' }, { key: 'DUES_CLEARANCE' }, { key: 'TITLE_DOCUMENT' }],
    encumbrances: [],
  };
  assert.deepEqual(failing(R.registrationChecks(base, VESSEL, { onRegister: true })), []);

  const owing = R.registrationChecks(base, VESSEL, { onRegister: true, outstandingDues: 1840000 });
  assert.ok(failing(owing).includes('Port dues and charges settled'));

  const charged = R.registrationChecks(
    { ...base, encumbrances: [{ kind: 'MORTGAGE', holder: 'A Bank' }], },
    VESSEL, { onRegister: true },
  );
  assert.ok(failing(charged).includes('No subsisting mortgage or charge'));
  assert.ok(failing(charged).includes('Mandatory evidence on file'), 'a live charge also demands its discharge');

  const discharged = R.registrationChecks(
    { ...base, encumbrances: [{ kind: 'MORTGAGE', holder: 'A Bank', dischargedOn: new Date('2026-02-01') }] },
    VESSEL, { onRegister: true },
  );
  assert.equal(failing(discharged).includes('No subsisting mortgage or charge'), false);
});

test('registration: a foreign sale must name the receiving flag', () => {
  const doc = {
    kind: 'DELETION', portOfRegistry: 'KDL', deletion: { reason: 'SOLD_FOREIGN' },
    evidence: [{ key: 'CLOSURE_APPLICATION' }, { key: 'DUES_CLEARANCE' }, { key: 'TITLE_DOCUMENT' }],
  };
  assert.ok(failing(R.registrationChecks(doc, VESSEL, { onRegister: true })).includes('Receiving flag stated'));
});

test('registration: a permanent certificate may supersede a provisional one', () => {
  const checks = R.registrationChecks(permanent(), VESSEL, { onRegister: false, bridging: true });
  assert.deepEqual(failing(checks), []);
  assert.ok(checks.some((c) => c.check === 'Supersedes a provisional certificate'));
});

test('registration: only a first registration is carved and surveyed', () => {
  assert.ok(REGISTRATION_TRANSITIONS.UNDER_SCRUTINY.includes('CARVING_NOTE_ISSUED'));
  assert.ok(REGISTRATION_TRANSITIONS.UNDER_SCRUTINY.includes('APPROVED'));
  assert.deepEqual(REGISTRATION_TRANSITIONS.GRANTED, []);
  assert.deepEqual(REGISTRATION_TRANSITIONS.REJECTED, []);
  assert.equal(REGISTRATION_TRANSITIONS.APPROVED.includes('GRANTED'), true);
});

test('registration: declared tonnage is checked against the fleet record but does not block', () => {
  const drifted = R.registrationChecks(
    permanent({ tonnage: { gross: 26000, net: 14000, certificateNo: 'TM/1' } }),
    { ...VESSEL, grt: 20000 }, {},
  );
  const c = drifted.find((x) => x.check === 'Declared tonnage agrees with the fleet record');
  assert.equal(c.passed, false);
  assert.equal(c.blocking, false);
  assert.deepEqual(failing(drifted), []);
});

/* B2 — the survey regime, and what a signature is actually worth. */

test('certificates: the survey schedule follows the convention, not a fixed rule', () => {
  const issued = new Date('2023-06-01');
  const expiry = new Date('2028-06-01');

  const equipment = SC.endorsementSchedule('CARGO_SHIP_SAFETY_EQUIPMENT', issued, expiry);
  assert.equal(equipment.filter((s) => s.kind === 'ANNUAL').length, 4);
  assert.equal(equipment.filter((s) => s.kind === 'INTERMEDIATE').length, 1);

  const security = SC.endorsementSchedule('SHIP_SECURITY_CERTIFICATE', issued, expiry);
  assert.deepEqual(security.map((s) => s.kind), ['INTERMEDIATE']);

  assert.deepEqual(SC.endorsementSchedule('TONNAGE_CERTIFICATE', issued, expiry), []);
  assert.equal(SC.nonExpiring('TONNAGE_CERTIFICATE'), true);
  assert.equal(SC.nonExpiring('SAFETY_MANAGEMENT_CERTIFICATE'), false);
});

test('certificates: a survey may be held inside its window and still count', () => {
  const issued = new Date('2023-06-01');
  const expiry = new Date('2028-06-01');
  const [first] = SC.endorsementSchedule('INTERNATIONAL_LOAD_LINE', issued, expiry);
  // three months either side of the anniversary
  assert.ok(first.dueFrom < first.anniversary && first.anniversary < first.dueTo);
  const early = new Date(first.anniversary.getTime() - 60 * 86400000);
  const doc = {
    status: 'ISSUED', entityType: 'INTERNATIONAL_LOAD_LINE', issueDate: issued, expiryDate: expiry,
    endorsements: [{ kind: 'ANNUAL', anniversary: first.anniversary, completedOn: early, result: 'ENDORSED', surveyor: 'A' }],
  };
  const state = SC.endorsementState(doc, new Date(first.dueTo.getTime() + 86400000));
  assert.equal(state.schedule[0].state, 'ENDORSED');
  assert.equal(state.overdue, 0);
});

test('certificates: an unendorsed certificate is not in force even before it expires', () => {
  const issued = new Date('2023-06-01');
  const expiry = new Date('2028-06-01');
  const now = new Date('2026-08-26');
  const bare = { status: 'ISSUED', entityType: 'CARGO_SHIP_SAFETY_EQUIPMENT', issueDate: issued, expiryDate: expiry, endorsements: [] };
  const state = SC.forceState(bare, now);
  assert.equal(state.inForce, false);
  assert.match(state.reason, /overdue/);
  // and the expiry date, read alone, would have said otherwise
  assert.ok(expiry > now);

  const keptUp = {
    ...bare,
    endorsements: SC.endorsementSchedule(bare.entityType, issued, expiry)
      .filter((s) => s.dueTo < now)
      .map((s) => ({ kind: s.kind, anniversary: s.anniversary, completedOn: s.anniversary, result: 'ENDORSED', surveyor: 'A' })),
  };
  assert.equal(SC.forceState(keptUp, now).inForce, true);
});

test('certificates: a refused endorsement takes the certificate out of force at once', () => {
  const issued = new Date('2026-01-01');
  const expiry = new Date('2031-01-01');
  const doc = {
    status: 'ISSUED', entityType: 'SAFETY_MANAGEMENT_CERTIFICATE', issueDate: issued, expiryDate: expiry,
    endorsements: [{ kind: 'ANNUAL', completedOn: new Date('2026-06-01'), result: 'NOT_ENDORSED', surveyor: 'A', remarks: 'Fire main defective' }],
  };
  const state = SC.forceState(doc, new Date('2026-08-26'));
  assert.equal(state.inForce, false);
  assert.match(state.reason, /not endorsed/i);
});

test('certificates: suspension and expiry are reported before the survey schedule', () => {
  const base = { entityType: 'SAFETY_MANAGEMENT_CERTIFICATE', issueDate: new Date('2020-01-01'), expiryDate: new Date('2025-01-01'), endorsements: [] };
  assert.match(SC.forceState({ ...base, status: 'SUSPENDED' }).reason, /suspended/);
  assert.match(SC.forceState({ ...base, status: 'ISSUED' }).reason, /Expired/);
});

test('certificates: a signature covers the register entry, so altering it breaks the signature', () => {
  const doc = {
    licenseNo: 'SMC-2026-0001', entityType: 'SAFETY_MANAGEMENT_CERTIFICATE',
    subjectKind: 'VESSEL', subjectRef: 'aaaaaaaaaaaaaaaaaaaaaaaa', entityName: 'MV Test',
    issueDate: new Date('2026-01-01'), expiryDate: new Date('2031-01-01'),
  };
  doc.signature = Sign.sign(doc);
  assert.equal(Sign.verify(doc).valid, true);

  for (const [field, value] of [
    ['entityName', 'MV Somebody Else'],
    ['expiryDate', new Date('2035-01-01')],
    ['licenseNo', 'SMC-2026-0002'],
    ['subjectRef', 'bbbbbbbbbbbbbbbbbbbbbbbb'],
  ]) {
    const altered = { ...doc, [field]: value };
    const v = Sign.verify(altered);
    assert.equal(v.valid, false, `altering ${field} must break the signature`);
    assert.match(v.reason, /altered since issue/);
  }
});

test('certificates: an unsigned record verifies as unsigned, not as valid', () => {
  const v = Sign.verify({ licenseNo: 'X', entityType: 'Y', entityName: 'Z' });
  assert.equal(v.signed, false);
  assert.equal(v.valid, false);
});

test('certificates: a signature from another key is refused rather than silently accepted', () => {
  const doc = { licenseNo: 'A', entityType: 'B', entityName: 'C', issueDate: new Date(), expiryDate: new Date() };
  doc.signature = { ...Sign.sign(doc), keyId: 'deadbeefdeadbeef' };
  const v = Sign.verify(doc);
  assert.equal(v.valid, false);
  assert.match(v.reason, /no longer holds/);
});

test('certificates: the published key identifies itself and the payload it signs', () => {
  const k = Sign.publicKey();
  assert.equal(k.alg, 'Ed25519');
  assert.match(k.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.equal(k.keyId.length, 16);
});

test('certificates: every statutory type carries a printed name and a convention', () => {
  for (const type of SC.STATUTORY_TYPES) {
    assert.ok(SC.CERT_LABEL[type], `${type} has no printed name`);
    assert.ok(SC.CONVENTION[type], `${type} names no convention`);
    assert.ok(SC.SURVEY_REGIME[type], `${type} has no survey regime`);
  }
  assert.equal(SC.isStatutory('NAVIGATION_LICENCE'), false);
});
