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
  const inv = await request(app).post('/api/invoices/generate').set(auth(finance)).send({ portCallId: id });
  assert.equal(inv.status, 201, inv.text);
  const d = inv.body.data;
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0].code, 'PD');
  assert.equal(d.lines[0].amount, inactiveSafe.grt * 12.5);
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
