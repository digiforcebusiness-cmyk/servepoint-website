import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCustomer } from '../api/_lib/actions.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
const auth = { getUserByEmail: async () => { throw notFound(); }, getUser: async (uid) => ({ uid, email: 'a@b.com', metadata: {} }) };

test('getCustomer merges all sources', async () => {
  const deps = {
    auth,
    rc: { getSubscriber: async () => ({ subscriptions: { m: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.1' } } }) },
    store: { getWindows: async () => null, getGrant: async () => ({ active: true, expiresAt: null }) },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.proSources, ['grant', 'play_store']);
  assert.deepEqual(r.errors, { revenuecat: null, firestore: null });
});

test('RevenueCat down → record still returned with error noted', async () => {
  const deps = {
    auth,
    rc: { getSubscriber: async () => { throw new Error('RevenueCat 500: boom'); } },
    store: { getWindows: async () => ({ product: 'monthly', active: true }), getGrant: async () => null },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.proSources, ['windows']);
  assert.match(r.errors.revenuecat, /boom/);
});

test('unresolvable query never calls RevenueCat', async () => {
  let called = false;
  const deps = {
    auth: { getUserByEmail: async () => { throw notFound(); }, getUser: async () => { throw notFound(); } },
    rc: { getSubscriber: async () => { called = true; return {}; } },
    store: { getWindows: async () => null, getGrant: async () => null },
  };
  await assert.rejects(getCustomer(deps, 'typo', now));
  assert.equal(called, false);
});
