import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listCustomers, getOverview } from '../api/_lib/actions.js';

const now = Date.parse('2026-10-15T10:00:00Z');

test('RevenueCat source: rows + emails from Firebase + cursor from next_page', async () => {
  let asked;
  const deps = {
    rc: { listCustomers: async () => ({
      items: [
        { id: 'u1', first_seen_at: 1767225600000, last_seen_at: 1767312000000, active_entitlements: { items: [{ expires_at: 1790000000000 }] } },
        { id: '$RCAnonymousID:a', first_seen_at: 1767225600000, last_seen_at: 1767225600000, active_entitlements: { items: [] } },
      ],
      next_page: '/v2/projects/p/customers?limit=50&starting_after=%24RCAnonymousID%3Aa',
    }) },
    auth: { getUsers: async (ids) => { asked = ids; return { users: [{ uid: 'u1', email: 'a@b.com' }] }; } },
  };
  const r = await listCustomers(deps, { source: 'revenuecat' }, now);
  assert.deepEqual(asked, [{ uid: 'u1' }]);
  assert.equal(r.nextCursor, '$RCAnonymousID:a');
  assert.deepEqual(r.rows[0], { uid: 'u1', email: 'a@b.com', isPro: true, plan: null, proUntil: new Date(1790000000000).toISOString(), firstSeen: new Date(1767225600000).toISOString(), lastSeen: new Date(1767312000000).toISOString() });
  assert.equal(r.rows[1].email, null);
  assert.equal(r.rows[1].isPro, false);
});

test('lifetime entitlement (expires_at null) → proUntil null but Pro', async () => {
  const deps = {
    rc: { listCustomers: async () => ({ items: [{ id: 'u1', active_entitlements: { items: [{ expires_at: null }] } }], next_page: null }) },
    auth: { getUsers: async () => ({ users: [] }) },
  };
  const r = await listCustomers(deps, {}, now);
  assert.equal(r.rows[0].isPro, true);
  assert.equal(r.rows[0].proUntil, null);
  assert.equal(r.nextCursor, null);
});

test('Windows source', async () => {
  const deps = { store: { listWindows: async () => ({ items: [{ uid: 'w1', email: 'w@x.com', product: 'lifetime', active: true, firstSeenAt: 'f', lastCheckedAt: 'l' }], nextCursor: 'w1' }) } };
  const r = await listCustomers(deps, { source: 'windows' }, now);
  assert.deepEqual(r, { rows: [{ uid: 'w1', email: 'w@x.com', isPro: true, plan: 'windows · lifetime', proUntil: null, firstSeen: 'f', lastSeen: 'l' }], nextCursor: 'w1' });
});

test('Grants source uses isGrantActive and Firebase emails', async () => {
  const deps = {
    store: { listGrants: async () => ({ items: [
      { uid: 'g1', active: true, expiresAt: '2026-10-01T00:00:00.000Z', grantedAt: 'x' },
      { uid: 'g2', active: true, expiresAt: null, grantedAt: 'y' },
    ], nextCursor: null }) },
    auth: { getUsers: async () => ({ users: [{ uid: 'g2', email: 'g@x.com' }] }) },
  };
  const r = await listCustomers(deps, { source: 'grants' }, now);
  assert.equal(r.rows[0].isPro, false); // expired
  assert.equal(r.rows[1].isPro, true);
  assert.equal(r.rows[1].email, 'g@x.com');
  assert.equal(r.rows[1].plan, 'grant · lifetime');
});

test('unknown source → 400', () =>
  assert.rejects(listCustomers({}, { source: 'nope' }, now), (e) => e.status === 400));

test('overview picks metrics and month start; one failing source does not break the other', async () => {
  let monthStart;
  const deps = {
    rc: { metricsOverview: async () => { throw new Error('RevenueCat 429: slow down'); } },
    store: { countWindows: async (a) => { monthStart = a.monthStart; return { monthly: 3, lifetime: 2, newThisMonth: 1 }; } },
  };
  const r = await getOverview(deps, now);
  assert.equal(monthStart, '2026-10-01T00:00:00.000Z');
  assert.equal(r.revenuecat, null);
  assert.match(r.errors.revenuecat, /429/);
  assert.deepEqual(r.windows, { monthly: 3, lifetime: 2, newThisMonth: 1 });

  deps.rc.metricsOverview = async () => ({ currency: 'USD', metrics: [
    { id: 'active_subscriptions', value: 10, unit: '#' }, { id: 'mrr', value: 49.9, unit: '$' },
    { id: 'active_trials', value: 4, unit: '#' }, { id: 'revenue', value: 120, unit: '$' }, { id: 'new_customers', value: 99, unit: '#' },
  ] });
  const ok = await getOverview(deps, now);
  assert.deepEqual(ok.revenuecat, { active_subscriptions: { value: 10, unit: '#' }, active_trials: { value: 4, unit: '#' }, mrr: { value: 49.9, unit: '$' }, revenue: { value: 120, unit: '$' } });
  assert.equal(ok.currency, 'USD');
});
