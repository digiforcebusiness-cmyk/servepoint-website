import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAdmin } from '../api/_lib/with-admin.js';

function fakeRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const deps = {
  auth: { verifyIdToken: async (t) => (t === 'good' ? { email: 'admin@x.com', email_verified: true } : Promise.reject(new Error('x'))) },
  adminEmails: ['admin@x.com'],
};

test('wrong method → 405', async () => {
  const res = fakeRes();
  await withAdmin('POST', async () => ({ body: {} }), () => deps)({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
test('no token → 401 and handler not called', async () => {
  let called = false;
  const res = fakeRes();
  await withAdmin('GET', async () => { called = true; return { body: {} }; }, () => deps)({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});
test('admin → handler status/body passed through with adminEmail', async () => {
  const res = fakeRes();
  await withAdmin('GET', async ({ adminEmail }) => ({ status: 207, body: { who: adminEmail } }), () => deps)(
    { method: 'GET', headers: { authorization: 'Bearer good' } }, res);
  assert.equal(res.statusCode, 207);
  assert.deepEqual(res.body, { who: 'admin@x.com' });
});
test('missing config → 500 with a clear message', async () => {
  const res = fakeRes();
  await withAdmin('GET', async () => ({ body: {} }), () => { throw Object.assign(new Error('Server not configured: missing ADMIN_EMAILS'), { status: 500 }); })(
    { method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 500);
});
