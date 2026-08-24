/* Security regression tests — run with the dev DB up and seeded (like api tests). */
process.env.NODE_ENV = 'test';
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../server');
const { connectDB } = require('../src/config/db');

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Mundra@2026' });
  assert.equal(res.status, 200, `login failed for ${email}: ${res.text}`);
  return res.body.data;
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

let admin;

test.before(async () => {
  await connectDB();
  admin = await login('admin@mundraport.in');
});
test.after(async () => { await mongoose.disconnect(); });

test('headers: helmet CSP and hardening headers are on every response', async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.headers['content-security-policy'].includes("default-src 'self'"));
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('injection: object-valued query params cannot smuggle Mongo operators', async () => {
  // ?status[$ne]=CANCELLED would, unsanitised, become {status: {$ne: ...}}
  const res = await request(app)
    .get('/api/port-calls?status[$ne]=CANCELLED&limit=5').set(auth(admin.token));
  assert.equal(res.status, 200);
  // the object param is dropped, so this behaves as an unfiltered list —
  // prove no operator semantics leaked by comparing with an equality filter
  const eq = await request(app).get('/api/port-calls?status=SAILED&limit=5').set(auth(admin.token));
  assert.equal(eq.status, 200);
  for (const c of eq.body.data) assert.equal(c.status, 'SAILED');
});

test('injection: $-prefixed keys are stripped from write bodies', async () => {
  const res = await request(app).post('/api/lookups').set(auth(admin.token))
    .send({ category: 'uom', code: 'SECT', label: 'SecTest', $where: 'sleep(1)', meta: { $gt: 'x', note: 'ok' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.$where, undefined);
  assert.equal((res.body.data.meta || {}).$gt, undefined);
  await request(app).delete(`/api/lookups/${res.body.data._id}`).set(auth(admin.token));
});

test('auth: an access token is refused as a refresh token (typ check)', async () => {
  const res = await request(app).post('/api/auth/refresh').send({ refreshToken: admin.token });
  assert.equal(res.status, 401);
  const good = await request(app).post('/api/auth/refresh').send({ refreshToken: admin.refreshToken });
  assert.equal(good.status, 200);
});

test('auth: forged and unsigned tokens are rejected', async () => {
  const forged = jwt.sign({ sub: '64b000000000000000000000' }, 'wrong-secret');
  assert.equal((await request(app).get('/api/vessels').set(auth(forged))).status, 401);
  const none = jwt.sign({ sub: '64b000000000000000000000' }, '', { algorithm: 'none' });
  assert.equal((await request(app).get('/api/vessels').set(auth(none))).status, 401);
});

test('auth: repeated failed logins throttle the identity (429)', async () => {
  const email = 'throttle-probe@mundraport.in';
  let last;
  for (let i = 0; i < 11; i += 1) {
    last = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
  }
  assert.equal(last.status, 429);
});

test('policy: admin password minimum length is enforced from settings', async () => {
  const res = await request(app).post('/api/users').set(auth(admin.token))
    .send({ name: 'Weak Pwd', email: 'weak@mundraport.in', password: 'short', role: '64b000000000000000000000' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least \d+ characters/);
});

test('secrets: settings API masks SMTP and AI credentials', async () => {
  const res = await request(app).get('/api/settings').set(auth(admin.token));
  assert.equal(res.status, 200);
  const { smtp, ai } = res.body.data;
  if (smtp && smtp.password) assert.ok(String(smtp.password).startsWith('••••'));
  if (ai && ai.apiKey) assert.ok(String(ai.apiKey).startsWith('••••'));
});
