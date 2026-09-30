import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantPro, revokePro, refundPlay, grantEnd, LIFETIME_END_MS } from '../api/_lib/actions.js';
import { HttpError } from '../api/_lib/http.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const DAY = 86400000;
const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });

function makeDeps({ firebaseUser = true, rcFails = false, storeFails = false, authError = null, subscriber = {} } = {}) {
  const log = [];
  const calls = [];
  return {
    log,
    calls,
    auth: { getUser: async (uid) => { if (authError) throw authError; if (!firebaseUser) throw notFound(); return { uid }; } },
    rc: {
      grantPromotional: async (uid, end) => { calls.push(['grant', uid, end]); if (rcFails) throw new HttpError(502, 'RevenueCat 500: down'); },
      revokePromotionals: async (uid) => { calls.push(['revoke', uid]); if (rcFails) throw new HttpError(502, 'RevenueCat 500: down'); },
      getSubscriber: async () => subscriber,
      refundTransaction: async (uid, tx) => { calls.push(['refund', uid, tx]); },
    },
    store: {
      setGrant: async (uid, g) => { calls.push(['setGrant', uid, g]); if (storeFails) throw new Error('firestore down'); },
      revokeGrant: async (uid, r) => { calls.push(['revokeGrant', uid, r]); if (storeFails) throw new Error('firestore down'); },
      addLog: async (e) => { log.push(e); },
    },
  };
}

test('grantEnd durations', () => {
  assert.deepEqual(grantEnd('week', now), { endMs: now + 7 * DAY, expiresAt: new Date(now + 7 * DAY).toISOString() });
  assert.equal(grantEnd('year', now).endMs, now + 365 * DAY);
  assert.deepEqual(grantEnd('lifetime', now), { endMs: LIFETIME_END_MS, expiresAt: null });
  assert.throws(() => grantEnd('forever', now), (e) => e.status === 400);
});

test('grant: RC then Firestore then log', async () => {
  const d = makeDeps();
  const r = await grantPro(d, { uid: 'u1', duration: 'month', note: 'promo', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { revenuecat: 'ok', firestore: 'ok', partial: false, expiresAt: new Date(now + 30 * DAY).toISOString() });
  assert.equal(d.calls[0][0], 'grant');
  assert.deepEqual(d.calls[1], ['setGrant', 'u1', { active: true, expiresAt: r.expiresAt, note: 'promo', grantedBy: 'a@x.com', grantedAt: new Date(now).toISOString() }]);
  assert.equal(d.log[0].action, 'grant');
  assert.equal(d.log[0].result, 'ok');
});

test('grant to anonymous RC-only customer: Firestore skipped, not partial', async () => {
  const d = makeDeps({ firebaseUser: false });
  const r = await grantPro(d, { uid: '$RCAnonymousID:z', duration: 'lifetime', adminEmail: 'a@x.com', now });
  assert.equal(r.firestore, 'skipped');
  assert.equal(r.partial, false);
  assert.equal(d.calls.some((c) => c[0] === 'setGrant'), false);
  assert.equal(d.calls[0][2], LIFETIME_END_MS);
});

test('grant: RC fails → 502, Firestore untouched, failure logged', async () => {
  const d = makeDeps({ rcFails: true });
  await assert.rejects(grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now }), (e) => e.status === 502);
  assert.equal(d.calls.some((c) => c[0] === 'setGrant'), false);
  assert.equal(d.log[0].result, 'failed');
});

test('grant: Firestore fails after RC → partial with error text', async () => {
  const d = makeDeps({ storeFails: true });
  const r = await grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now });
  assert.equal(r.partial, true);
  assert.match(r.firestore, /^error: firestore down/);
  assert.equal(d.log[0].result, 'partial');
});

test('grant: missing uid → 400', () =>
  assert.rejects(grantPro(makeDeps(), { duration: 'week', adminEmail: 'a@x.com', now }), (e) => e.status === 400));

test('grant: account lookup fails → 502, RC untouched, failure logged', async () => {
  const authDown = Object.assign(new Error('auth down'), { code: 'auth/internal-error' });
  const d = makeDeps({ authError: authDown });
  await assert.rejects(grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now }), (e) => e.status === 502);
  assert.equal(d.calls.some((c) => c[0] === 'grant'), false);
  assert.equal(d.log[0].result, 'failed');
});

test('revoke: RC then Firestore', async () => {
  const d = makeDeps();
  const r = await revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { revenuecat: 'ok', firestore: 'ok', partial: false });
  assert.deepEqual(d.calls[1], ['revokeGrant', 'u1', { revokedBy: 'a@x.com', revokedAt: new Date(now).toISOString() }]);
});

test('revoke: account lookup fails → 502, RC untouched, failure logged', async () => {
  const authDown = Object.assign(new Error('auth down'), { code: 'auth/internal-error' });
  const d = makeDeps({ authError: authDown });
  await assert.rejects(revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now }), (e) => e.status === 502);
  assert.equal(d.calls.some((c) => c[0] === 'revoke'), false);
  assert.equal(d.log[0].result, 'failed');
});

const playSub = {
  subscriptions: {
    play_m: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.1' },
    ios_m: { store: 'app_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: '2000' },
    play_r: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.9', refunded_at: '2026-09-20T00:00:00Z' },
  },
};

test('refund: Play transaction → refunded + logged', async () => {
  const d = makeDeps({ subscriber: playSub });
  const r = await refundPlay(d, { uid: 'u1', storeTransactionId: 'GPA.1', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { refunded: true, product: 'play_m' });
  assert.deepEqual(d.calls.at(-1), ['refund', 'u1', 'GPA.1']);
  assert.equal(d.log[0].action, 'refund');
});

for (const [label, tx] of [['App Store', '2000'], ['already refunded', 'GPA.9'], ['not this customer', 'GPA.404']]) {
  test(`refund rejects ${label} with 400 before calling RevenueCat refund`, async () => {
    const d = makeDeps({ subscriber: playSub });
    await assert.rejects(refundPlay(d, { uid: 'u1', storeTransactionId: tx, adminEmail: 'a@x.com', now }), (e) => e.status === 400);
    assert.equal(d.calls.some((c) => c[0] === 'refund'), false);
  });
}
