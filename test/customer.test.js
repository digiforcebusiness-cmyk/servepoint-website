import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRcSubscriber, buildCustomerRecord, isGrantActive, mergeRcSubscribers } from '../api/_lib/customer.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const future = '2026-11-01T00:00:00Z';
const past = '2026-09-01T00:00:00Z';

const sub = {
  first_seen: '2026-01-01T00:00:00Z',
  subscriber_attributes: { $email: { value: 'a@b.com' } },
  entitlements: { 'ServePoint Pro': { expires_date: future } },
  subscriptions: {
    play_monthly: { store: 'play_store', expires_date: future, purchase_date: past, store_transaction_id: 'GPA.1', period_type: 'normal' },
    ios_monthly: { store: 'app_store', expires_date: past, store_transaction_id: '2000', period_type: 'normal' },
    play_trial: { store: 'play_store', expires_date: future, store_transaction_id: 'GPA.2', period_type: 'trial' },
    play_cancel: { store: 'play_store', expires_date: future, store_transaction_id: 'GPA.3', unsubscribe_detected_at: past },
    play_refunded: { store: 'play_store', expires_date: future, store_transaction_id: 'GPA.4', refunded_at: past },
    'rc_promo_ServePoint Pro_custom': { store: 'promotional', expires_date: future, store_transaction_id: 'promo1' },
  },
  non_subscriptions: {
    lifetime: [{ store: 'app_store', purchase_date: past, store_transaction_id: '3000' }],
  },
};

test('normalizeRcSubscriber statuses, email, refundable only for unrefunded Play', () => {
  const n = normalizeRcSubscriber(sub, now);
  const by = Object.fromEntries(n.subscriptions.map((s) => [s.product, s]));
  assert.equal(n.email, 'a@b.com');
  assert.equal(n.entitlementActive, true);
  assert.equal(by.play_monthly.status, 'active');
  assert.equal(by.ios_monthly.status, 'expired');
  assert.equal(by.play_trial.status, 'trial');
  assert.equal(by.play_cancel.status, 'cancelled');
  assert.equal(by.play_refunded.status, 'refunded');
  assert.equal(by.lifetime.status, 'owned');
  assert.equal(by.play_monthly.refundable, true);
  assert.equal(by.play_refunded.refundable, false);
  assert.equal(by.ios_monthly.refundable, false);
  assert.equal(by.lifetime.refundable, false);
});

test('normalizeRcSubscriber tolerates an empty subscriber', () => {
  const n = normalizeRcSubscriber({}, now);
  assert.deepEqual(n, { firstSeen: null, email: null, entitlementActive: false, subscriptions: [] });
});

test('isGrantActive', () => {
  assert.equal(isGrantActive(null, now), false);
  assert.equal(isGrantActive({ active: true, expiresAt: null }, now), true);
  assert.equal(isGrantActive({ active: true, expiresAt: past }, now), false);
  assert.equal(isGrantActive({ active: false, expiresAt: null }, now), false);
});

test('buildCustomerRecord merges sources and prefers Firebase email', () => {
  const r = buildCustomerRecord({
    uid: 'u1',
    authUser: { email: 'auth@x.com', createdAt: '2026-01-02T00:00:00.000Z' },
    rc: normalizeRcSubscriber(sub, now),
    windows: { product: 'lifetime', active: true, email: 'win@x.com' },
    grant: { active: true, expiresAt: null, note: 'partner' },
    now,
  });
  assert.equal(r.email, 'auth@x.com');
  assert.equal(r.isPro, true);
  assert.deepEqual(r.proSources, ['app_store', 'grant', 'play_store', 'windows']);
  assert.equal(r.grant.isActive, true);
});

test('buildCustomerRecord with nothing → not Pro, email from RC then Windows', () => {
  const r = buildCustomerRecord({ uid: 'x', authUser: null, rc: null, windows: { active: false, email: 'w@x.com' }, grant: null, now });
  assert.equal(r.isPro, false);
  assert.deepEqual(r.proSources, []);
  assert.equal(r.email, 'w@x.com');
  assert.deepEqual(r.subscriptions, []);
});

test('mergeRcSubscribers combines two projects', () => {
  const a = { firstSeen: '2026-03-01T00:00:00Z', email: null, entitlementActive: false, subscriptions: [{ product: 'a' }] };
  const b = { firstSeen: '2026-01-01T00:00:00Z', email: 'b@x.com', entitlementActive: true, subscriptions: [{ product: 'b' }] };
  assert.deepEqual(mergeRcSubscribers([a, b]), {
    firstSeen: '2026-01-01T00:00:00Z', email: 'b@x.com', entitlementActive: true, subscriptions: [{ product: 'a' }, { product: 'b' }],
  });
});

test('mergeRcSubscribers skips nulls and returns null when all are null', () => {
  const a = { firstSeen: null, email: 'a@x.com', entitlementActive: false, subscriptions: [] };
  assert.deepEqual(mergeRcSubscribers([null, a]), a);
  assert.equal(mergeRcSubscribers([null, null]), null);
});
