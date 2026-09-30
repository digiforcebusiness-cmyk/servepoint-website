import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireAdmin, parseAdminEmails } from '../api/_lib/auth.js';
import { HttpError } from '../api/_lib/http.js';

const admins = parseAdminEmails(' Mobilestudio66@gmail.com, digiforcebusiness@gmail.com ,');
const req = (authorization) => ({ headers: authorization ? { authorization } : {} });
const verify = (claims) => async (token) => {
  if (token !== 'good') throw new Error('bad token');
  return claims;
};
const rejectsWith = (p, status) =>
  assert.rejects(p, (e) => e instanceof HttpError && e.status === status);

test('parseAdminEmails trims, lower-cases, drops empties', () => {
  assert.deepEqual(admins, ['mobilestudio66@gmail.com', 'digiforcebusiness@gmail.com']);
});
test('missing header → 401', () =>
  rejectsWith(requireAdmin(req(), { verifyIdToken: verify({}), adminEmails: admins }), 401));
test('invalid token → 401', () =>
  rejectsWith(requireAdmin(req('Bearer nope'), { verifyIdToken: verify({}), adminEmails: admins }), 401));
test('verified non-admin → 403', () =>
  rejectsWith(requireAdmin(req('Bearer good'), {
    verifyIdToken: verify({ email: 'someone@gmail.com', email_verified: true }), adminEmails: admins,
  }), 403));
test('admin address but unverified → 403', () =>
  rejectsWith(requireAdmin(req('Bearer good'), {
    verifyIdToken: verify({ email: 'mobilestudio66@gmail.com', email_verified: false }), adminEmails: admins,
  }), 403));
test('verified admin (any case) → returns lower-cased email', async () => {
  const email = await requireAdmin(req('Bearer good'), {
    verifyIdToken: verify({ email: 'MobileStudio66@gmail.com', email_verified: true }), adminEmails: admins,
  });
  assert.equal(email, 'mobilestudio66@gmail.com');
});
