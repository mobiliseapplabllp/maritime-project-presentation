/* API tests — run with the dev DB up and seeded. Mutates data; re-seed afterwards. */
process.env.NODE_ENV = 'test';
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB } = require('../src/config/db');

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Mundra@2026' });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  return res.body.data.token;
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let admin, agent, surveyor, finance;

test.before(async () => {
  await connectDB();
  [admin, agent, surveyor, finance] = await Promise.all([
    login('admin@mundraport.in'), login('agent@mundraport.in'),
    login('surveyor@mundraport.in'), login('finance@mundraport.in'),
  ]);
});
test.after(async () => { await mongoose.disconnect(); });

test('auth: wrong password is 401, no token no entry', async () => {
  const bad = await request(app).post('/api/auth/login').send({ email: 'admin@mundraport.in', password: 'nope' });
  assert.equal(bad.status, 401);
  const noTok = await request(app).get('/api/vessels');
  assert.equal(noTok.status, 401);
});

test('rbac: shipping agent cannot list users or manage masters', async () => {
  assert.equal((await request(app).get('/api/users').set(auth(agent))).status, 403);
  assert.equal((await request(app).post('/api/berths').set(auth(agent)).send({ code: 'X' })).status, 403);
  assert.equal((await request(app).get('/api/port-calls').set(auth(agent))).status, 200);
});

test('rbac: finance cannot create inspections; surveyor can close them', async () => {
  assert.equal((await request(app).post('/api/inspections').set(auth(finance)).send({})).status, 403);
  const list = await request(app).get('/api/inspections?status=IN_PROGRESS').set(auth(surveyor));
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 1, 'seed should have an in-progress inspection');
});

test('port call lifecycle: create -> illegal jump 409 -> confirm -> berth conflict 409 -> berth -> sail', async () => {
  const vessels = await request(app).get('/api/vessels?limit=50').set(auth(admin));
  const inactiveSafe = vessels.body.data.find((v) => v.type === 'CONT');
  const created = await request(app).post('/api/port-calls').set(auth(admin)).send({
    vessel: inactiveSafe._id, eta: new Date(Date.now() + 3600e3).toISOString(), agentCode: 'KSA', purpose: 'Test call',
  });
  assert.equal(created.status, 201, created.text);
  const id = created.body.data._id;
  assert.equal(created.body.data.status, 'ANNOUNCED');
  assert.match(created.body.data.vcn, /^MUN-\d{4}-\d{4}$/);

  const jump = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'SAILED' });
  assert.equal(jump.status, 409);

  const confirm = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'CONFIRMED' });
  assert.equal(confirm.status, 200);

  const noBerth = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'BERTHED' });
  assert.equal(noBerth.status, 400); // berth required

  const dash = await request(app).get('/api/dashboard').set(auth(admin));
  const occupied = dash.body.data.berthBoard.find((b) => b.occupiedBy && b.berthType === 'CONTAINER');
  const free = dash.body.data.berthBoard.find((b) => !b.occupiedBy && b.status === 'OPERATIONAL' && b.berthType === 'CONTAINER');
  assert.ok(occupied && free, 'need one occupied and one free container berth from seed');

  const clash = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'BERTHED', berth: occupied._id });
  assert.equal(clash.status, 409);
  assert.match(clash.body.message, new RegExp(occupied.occupiedBy.vcn));

  const berthed = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'BERTHED', berth: free._id });
  assert.equal(berthed.status, 200, berthed.text);
  assert.ok(berthed.body.data.atb);

  const cancelBerthed = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'CANCELLED', note: 'x' });
  assert.equal(cancelBerthed.status, 409); // berthed can only sail

  const sailed = await request(app).post(`/api/port-calls/${id}/transition`).set(auth(admin)).send({ to: 'SAILED' });
  assert.equal(sailed.status, 200);
  assert.equal(sailed.body.data.status, 'SAILED');

  // invoice for the sailed test call: port dues only (no cargo/services)
  const tariffRes = await request(app).get('/api/tariffs?limit=100').set(auth(finance));
  const pdRate = tariffRes.body.data.find((t) => t.code === 'PD').rate;
  const inv = await request(app).post('/api/invoices/generate').set(auth(finance)).send({ portCallId: id });
  assert.equal(inv.status, 201, inv.text);
  const d = inv.body.data;
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0].code, 'PD');
  assert.equal(d.lines[0].amount, Math.round(inactiveSafe.grt * pdRate * 100) / 100);
  assert.equal(d.total, Math.round(d.subtotal * 1.18 * 100) / 100);

  const dup = await request(app).post('/api/invoices/generate').set(auth(finance)).send({ portCallId: id });
  assert.equal(dup.status, 409);

  const issued = await request(app).post(`/api/invoices/${d._id}/issue`).set(auth(finance));
  assert.equal(issued.status, 200);
  const paid = await request(app).post(`/api/invoices/${d._id}/pay`).set(auth(finance)).send({ paymentRef: 'NEFT-1' });
  assert.equal(paid.status, 200);
  const editPaid = await request(app).put(`/api/invoices/${d._id}`).set(auth(finance)).send({ notes: 'no' });
  assert.equal(editPaid.status, 400); // paid is immutable
});

test('certificates register derives statuses and audit log records actions', async () => {
  const certs = await request(app).get('/api/vessels/certificates/all?status=EXPIRED').set(auth(surveyor));
  assert.equal(certs.status, 200);
  assert.ok(certs.body.data.length >= 2);
  assert.ok(certs.body.data.every((c) => c.status === 'EXPIRED'));

  const audit = await request(app).get('/api/audit?entity=PortCall&limit=5').set(auth(admin));
  assert.equal(audit.status, 200);
  assert.ok(audit.body.data.length >= 1);
  assert.ok(audit.body.data[0].actor.email);
});

test('v3 rbac: nmc officer sees incidents; agent does not; finance cannot create seafarers', async () => {
  const nmc = await login('nmc@mundraport.in');
  const inc = await request(app).get('/api/incidents').set(auth(nmc));
  assert.equal(inc.status, 200);
  assert.ok(inc.body.data.length >= 4);
  assert.equal((await request(app).get('/api/incidents').set(auth(agent))).status, 403);
  assert.equal((await request(app).post('/api/seafarers').set(auth(finance)).send({})).status, 403);
});

test('v3 licenses: lifecycle transitions enforced', async () => {
  const created = await request(app).post('/api/licenses').set(auth(admin))
    .send({ entityName: 'Test Marine Co', entityType: 'MARINE_SURVEYOR' });
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal(created.body.data.status, 'APPLIED');
  const illegal = await request(app).post(`/api/licenses/${id}/transition`).set(auth(admin)).send({ to: 'SUSPENDED', note: 'x' });
  assert.equal(illegal.status, 409);
  const review = await request(app).post(`/api/licenses/${id}/transition`).set(auth(admin)).send({ to: 'UNDER_REVIEW' });
  assert.equal(review.status, 200);
  const issued = await request(app).post(`/api/licenses/${id}/transition`).set(auth(admin)).send({ to: 'ISSUED' });
  assert.equal(issued.status, 200);
  assert.ok(issued.body.data.expiryDate, 'issue must set an expiry');
  assert.equal(issued.body.data.history.length, 3);
});

test('v3 risk engine: explainable scores with factor decomposition', async () => {
  const surveyorTok = await login('surveyor@mundraport.in');
  const res = await request(app).get('/api/risk/scores').set(auth(surveyorTok));
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 15);
  for (const r of res.body.data.slice(0, 5)) {
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.band));
    assert.ok(r.factors.length >= 5, 'factors must decompose the score');
    assert.ok(r.factors.every((f) => f.points <= f.max + 0.001), 'no factor may exceed its weight');
  }
  // weights guarded
  assert.equal((await request(app).put('/api/risk/weights').set(auth(surveyorTok)).send({ age: 20 })).status, 403);
  const upd = await request(app).put('/api/risk/weights').set(auth(admin)).send({ age: 20 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.age, 20);
  await request(app).put('/api/risk/weights').set(auth(admin)).send({ age: 15 }); // restore
});

test('v3 ai chat: grounded answers with sources', async () => {
  const res = await request(app).post('/api/ai/chat').set(auth(agent)).send({ message: 'What is the berth occupancy right now?' });
  assert.equal(res.status, 200, res.text);
  assert.match(res.body.data.reply, /berths are occupied/i);
  assert.ok(res.body.data.sources.some((s) => s.link === '/berth-board'));
  assert.ok(res.body.data.suggestions.length >= 2);
  const vcnQ = await request(app).post('/api/ai/chat').set(auth(agent)).send({ message: 'status of MUN-2026-0002' });
  assert.equal(vcnQ.status, 200);
});

test('v3 legislation: acknowledgment flow', async () => {
  const list = await request(app).get('/api/instruments?q=PORT-N-07').set(auth(agent));
  const inst = list.body.data[0];
  assert.ok(inst && inst.ackRequired);
  const ack = await request(app).post(`/api/instruments/${inst._id}/acknowledge`).set(auth(agent));
  assert.equal(ack.status, 200);
  assert.ok(ack.body.data.acknowledgedBy.length >= 1);
  const again = await request(app).post(`/api/instruments/${inst._id}/acknowledge`).set(auth(agent));
  assert.equal(again.body.data.acknowledgedBy.length, ack.body.data.acknowledgedBy.length); // idempotent
});
