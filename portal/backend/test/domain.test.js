const test = require('node:test');
const assert = require('node:assert/strict');

const { canTransition } = require('../src/domain/transitions');
const { certStatus } = require('../src/domain/certStatus');
const { computeTotals, buildInvoiceLines } = require('../src/domain/invoiceMath');
const { overlaps, findBerthConflict } = require('../src/domain/berthConflict');
const { hasPerm } = require('../src/domain/rbac');

test('port call transitions: legal paths allowed', () => {
  assert.equal(canTransition('ANNOUNCED', 'CONFIRMED').ok, true);
  assert.equal(canTransition('CONFIRMED', 'AT_ANCHORAGE').ok, true);
  assert.equal(canTransition('CONFIRMED', 'BERTHED').ok, true); // direct berthing is real
  assert.equal(canTransition('AT_ANCHORAGE', 'BERTHED').ok, true);
  assert.equal(canTransition('BERTHED', 'SAILED').ok, true);
  assert.equal(canTransition('AT_ANCHORAGE', 'CANCELLED').ok, true);
});

test('port call transitions: illegal paths rejected with reason', () => {
  for (const [from, to] of [
    ['ANNOUNCED', 'BERTHED'], ['ANNOUNCED', 'SAILED'], ['BERTHED', 'CANCELLED'],
    ['SAILED', 'BERTHED'], ['CANCELLED', 'CONFIRMED'], ['BERTHED', 'AT_ANCHORAGE'],
  ]) {
    const r = canTransition(from, to);
    assert.equal(r.ok, false, `${from}->${to} must be illegal`);
    assert.match(r.error, /cannot move/i);
  }
  assert.equal(canTransition('NOPE', 'SAILED').ok, false);
});

test('certificate status derivation with 30-day window', () => {
  const now = new Date('2026-08-23T00:00:00Z');
  assert.equal(certStatus(new Date('2026-08-22T00:00:00Z'), now), 'EXPIRED');
  assert.equal(certStatus(new Date('2026-08-23T00:00:00Z'), now), 'EXPIRING'); // expires today = still valid until EOD -> expiring
  assert.equal(certStatus(new Date('2026-09-22T00:00:00Z'), now), 'EXPIRING'); // day 30
  assert.equal(certStatus(new Date('2026-09-23T00:00:00Z'), now), 'VALID');    // day 31
  assert.equal(certStatus(new Date('2027-01-01T00:00:00Z'), now), 'VALID');
});

test('invoice totals: line math, GST and paise rounding', () => {
  const lines = [
    { qty: 42000, rate: 12.5 },     // 525000.00 port dues on GRT
    { qty: 3, rate: 1234.505 },     // 3703.515 -> 3703.52 (round half up per line)
    { qty: 2, rate: 62000 },        // 124000
  ];
  const t = computeTotals(lines, 18);
  assert.equal(t.lines[1].amount, 3703.52);
  assert.equal(t.subtotal, 652703.52);
  assert.equal(t.gstAmount, 117486.63); // 652703.52 * 0.18 = 117486.6336 -> .63
  assert.equal(t.total, 770190.15);
});

test('invoice generation from a port call uses tariff map and cargo quantities', () => {
  const tariffs = {
    PD:  { code: 'PD',  name: 'Port dues',          unit: 'per GRT',  rate: 12.5 },
    PIL: { code: 'PIL', name: 'Pilotage',           unit: 'per movement', rate: 85000 },
    TUG: { code: 'TUG', name: 'Tug charges',        unit: 'per tug-movement', rate: 62000 },
    WFC: { code: 'WFC', name: 'Wharfage container', unit: 'per TEU',  rate: 950 },
    WFB: { code: 'WFB', name: 'Wharfage bulk',      unit: 'per MT',   rate: 118 },
  };
  const call = {
    vessel: { grt: 42000, type: 'CONT' },
    services: [
      { type: 'PILOTAGE', tariffCode: 'PIL', qty: 2 },
      { type: 'TUGS', tariffCode: 'TUG', qty: 4 },
    ],
    cargoOps: [
      { cargoType: 'CONTAINERS', unit: 'TEU', qty: 1800 },
    ],
  };
  const lines = buildInvoiceLines(call, tariffs);
  const byCode = Object.fromEntries(lines.map((l) => [l.code, l]));
  assert.equal(byCode.PD.amount, 525000);
  assert.equal(byCode.PIL.amount, 170000);
  assert.equal(byCode.TUG.amount, 248000);
  assert.equal(byCode.WFC.amount, 1710000); // 1800 TEU x 950
  assert.equal(byCode.WFB, undefined);      // no bulk cargo on a container call
});

test('berth window overlap: strict interior overlap only', () => {
  const d = (s) => new Date(s);
  assert.equal(overlaps(d('2026-08-01'), d('2026-08-03'), d('2026-08-02'), d('2026-08-04')), true);
  assert.equal(overlaps(d('2026-08-01'), d('2026-08-02'), d('2026-08-02'), d('2026-08-04')), false); // touching edges OK
  assert.equal(overlaps(d('2026-08-05'), d('2026-08-06'), d('2026-08-01'), d('2026-08-02')), false);
});

test('berth conflict finder names the clashing call and ignores self + other berths', () => {
  const calls = [
    { _id: 'a', vcn: 'MUN-1', berth: 'B1', atb: new Date('2026-08-20'), etd: new Date('2026-08-25') },
    { _id: 'b', vcn: 'MUN-2', berth: 'B2', atb: new Date('2026-08-20'), etd: new Date('2026-08-25') },
  ];
  const hit = findBerthConflict(calls, 'B1', new Date('2026-08-24'), new Date('2026-08-26'), 'x');
  assert.equal(hit.vcn, 'MUN-1');
  assert.equal(findBerthConflict(calls, 'B1', new Date('2026-08-25'), new Date('2026-08-27'), 'x'), null);
  assert.equal(findBerthConflict(calls, 'B1', new Date('2026-08-24'), new Date('2026-08-26'), 'a'), null); // self excluded
});

test('rbac: wildcard and exact permission checks', () => {
  assert.equal(hasPerm(['*'], 'vessels.delete'), true);
  assert.equal(hasPerm(['vessels.view', 'portcalls.view'], 'vessels.view'), true);
  assert.equal(hasPerm(['vessels.view'], 'vessels.edit'), false);
  assert.equal(hasPerm([], 'dashboard.view'), false);
  assert.equal(hasPerm(null, 'dashboard.view'), false);
});
