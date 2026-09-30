import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCustomer } from '../api/_lib/actions.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
const auth = { getUserByEmail: async () => { throw notFound(); }, getUser: async (uid) => ({ uid, email: 'a@b.com', metadata: {} }) };
const playSub = { subscriptions: { play_m: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.1' } } };
const iosSub = { subscriptions: { ios_m: { store: 'app_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: '2000' } } };

test('getCustomer merges all sources', async () => {
  const deps = {
    auth,
    rc: { ios: { getSubscriber: async () => ({}) }, android: { getSubscriber: async () => playSub } },
    store: { getWindows: async () => null, getGrant: async () => ({ active: true, expiresAt: null }) },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.proSources, ['grant', 'play_store']);
  assert.deepEqual(r.errors, { revenuecat: null, firestore: null });
});

test('both RevenueCat projects contribute subscriptions', async () => {
  const deps = {
    auth,
    rc: { ios: { getSubscriber: async () => iosSub }, android: { getSubscriber: async () => playSub } },
    store: { getWindows: async () => null, getGrant: async () => null },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.subscriptions.map((s) => s.product).sort(), ['ios_m', 'play_m']);
  assert.deepEqual(r.proSources, ['app_store', 'play_store']);
  assert.equal(r.errors.revenuecat, null);
});

test('one project failing → record returned, error names only that project', async () => {
  const deps = {
    auth,
    rc: { ios: { getSubscriber: async () => { throw new Error('RevenueCat 500: boom'); } }, android: { getSubscriber: async () => playSub } },
    store: { getWindows: async () => null, getGrant: async () => null },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.proSources, ['play_store']);
  assert.match(r.errors.revenuecat, /^iOS: .*boom$/);
  assert.doesNotMatch(r.errors.revenuecat, /Android/);
});

test('RevenueCat down → record still returned with both errors noted', async () => {
  const deps = {
    auth,
    rc: {
      ios: { getSubscriber: async () => { throw new Error('RevenueCat 500: boom'); } },
      android: { getSubscriber: async () => { throw new Error('RevenueCat 500: bang'); } },
    },
    store: { getWindows: async () => ({ product: 'monthly', active: true }), getGrant: async () => null },
  };
  const r = await getCustomer(deps, 'u1', now);
  assert.deepEqual(r.proSources, ['windows']);
  assert.equal(r.errors.revenuecat, 'iOS: RevenueCat 500: boom; Android: RevenueCat 500: bang');
});

test('unresolvable query never calls RevenueCat', async () => {
  const called = [];
  const deps = {
    auth: { getUserByEmail: async () => { throw notFound(); }, getUser: async () => { throw notFound(); } },
    rc: {
      ios: { getSubscriber: async () => { called.push('ios'); return {}; } },
      android: { getSubscriber: async () => { called.push('android'); return {}; } },
    },
    store: { getWindows: async () => null, getGrant: async () => null },
  };
  await assert.rejects(getCustomer(deps, 'typo', now));
  assert.deepEqual(called, []);
});
