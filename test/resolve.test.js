import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCustomerId } from '../api/_lib/resolve.js';
import { HttpError } from '../api/_lib/http.js';

const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
const auth = {
  getUserByEmail: async (e) => { if (e === 'a@b.com') return { uid: 'u1', email: e, metadata: { creationTime: 'Thu, 01 Jan 2026 00:00:00 GMT' } }; throw notFound(); },
  getUser: async (uid) => { if (uid === 'u1') return { uid, email: 'a@b.com', metadata: {} }; throw notFound(); },
};
const is404 = (e) => e instanceof HttpError && e.status === 404;

test('email → uid + authUser', async () => {
  const r = await resolveCustomerId('  a@b.com ', { auth });
  assert.equal(r.uid, 'u1');
  assert.equal(r.authUser.createdAt, '2026-01-01T00:00:00.000Z');
});
test('unknown email → 404', () => assert.rejects(resolveCustomerId('x@y.com', { auth }), is404));
test('Firebase uid → uid', async () => assert.equal((await resolveCustomerId('u1', { auth })).uid, 'u1'));
test('RevenueCat anonymous id → passes through without authUser', async () => {
  const r = await resolveCustomerId('$RCAnonymousID:abc', { auth });
  assert.deepEqual(r, { uid: '$RCAnonymousID:abc', authUser: null });
});
test('random text → 404 (never reaches RevenueCat)', () => assert.rejects(resolveCustomerId('typo', { auth }), is404));
test('empty → 400', () =>
  assert.rejects(resolveCustomerId('  ', { auth }), (e) => e instanceof HttpError && e.status === 400));
