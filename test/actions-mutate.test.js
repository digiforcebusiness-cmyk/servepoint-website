import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantPro, revokePro, refundPlay, grantEnd, LIFETIME_END_MS } from '../api/_lib/actions.js';
import { HttpError } from '../api/_lib/http.js';

const now = Date.parse('2026-10-01T00:00:00Z');
const DAY = 86400000;
const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });

function makeRc(name, calls, fails, subscriber) {
  const down = () => new HttpError(502, `RevenueCat 500: ${name} down`);
  return {
    grantPromotional: async (uid, end) => { calls.push([`${name}:grant`, uid, end]); if (fails) throw down(); },
    revokePromotionals: async (uid) => { calls.push([`${name}:revoke`, uid]); if (fails) throw down(); },
    getSubscriber: async (uid) => { calls.push([`${name}:getSubscriber`, uid]); return subscriber; },
    refundTransaction: async (uid, tx) => { calls.push([`${name}:refund`, uid, tx]); },
  };
}

function makeDeps({ firebaseUser = true, iosFails = false, androidFails = false, storeFails = false, authError = null, subscriber = {} } = {}) {
  const log = [];
  const calls = [];
  return {
    log,
    calls,
    auth: { getUser: async (uid) => { if (authError) throw authError; if (!firebaseUser) throw notFound(); return { uid }; } },
    rc: { ios: makeRc('ios', calls, iosFails, subscriber), android: makeRc('android', calls, androidFails, subscriber) },
    store: {
      setGrant: async (uid, g) => { calls.push(['setGrant', uid, g]); if (storeFails) throw new Error('firestore down'); },
      revokeGrant: async (uid, r) => { calls.push(['revokeGrant', uid, r]); if (storeFails) throw new Error('firestore down'); },
      addLog: async (e) => { log.push(e); },
    },
  };
}

const names = (d) => d.calls.map((c) => c[0]);

test('grantEnd durations', () => {
  assert.deepEqual(grantEnd('week', now), { endMs: now + 7 * DAY, expiresAt: new Date(now + 7 * DAY).toISOString() });
  assert.equal(grantEnd('year', now).endMs, now + 365 * DAY);
  assert.deepEqual(grantEnd('lifetime', now), { endMs: LIFETIME_END_MS, expiresAt: null });
  assert.throws(() => grantEnd('forever', now), (e) => e.status === 400);
});

test('grant: both RC projects (iOS then Android), then Firestore, then log', async () => {
  const d = makeDeps();
  const r = await grantPro(d, { uid: 'u1', duration: 'month', note: 'promo', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { revenuecat: { ios: 'ok', android: 'ok' }, firestore: 'ok', partial: false, expiresAt: new Date(now + 30 * DAY).toISOString() });
  assert.deepEqual(names(d), ['ios:grant', 'android:grant', 'setGrant']);
  assert.deepEqual(d.calls[2], ['setGrant', 'u1', { active: true, expiresAt: r.expiresAt, note: 'promo', grantedBy: 'a@x.com', grantedAt: new Date(now).toISOString() }]);
  assert.equal(d.log[0].action, 'grant');
  assert.equal(d.log[0].result, 'ok');
  assert.deepEqual(d.log[0].revenuecat, { ios: 'ok', android: 'ok' });
});

test('grant to anonymous RC-only customer: Firestore skipped, not partial', async () => {
  const d = makeDeps({ firebaseUser: false });
  const r = await grantPro(d, { uid: '$RCAnonymousID:z', duration: 'lifetime', adminEmail: 'a@x.com', now });
  assert.equal(r.firestore, 'skipped');
  assert.equal(r.partial, false);
  assert.equal(d.calls.some((c) => c[0] === 'setGrant'), false);
  assert.equal(d.calls[0][2], LIFETIME_END_MS);
});

test('grant: one project fails → partial, Firestore still written, log partial', async () => {
  const d = makeDeps({ iosFails: true });
  const r = await grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now });
  assert.equal(r.partial, true);
  assert.match(r.revenuecat.ios, /^error: .*ios down/);
  assert.equal(r.revenuecat.android, 'ok');
  assert.equal(r.firestore, 'ok');
  assert.deepEqual(names(d), ['ios:grant', 'android:grant', 'setGrant']);
  assert.equal(d.log[0].result, 'partial');
  assert.deepEqual(d.log[0].revenuecat, r.revenuecat);
});

test('grant: Android fails alone → partial', async () => {
  const d = makeDeps({ androidFails: true });
  const r = await grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now });
  assert.equal(r.partial, true);
  assert.equal(r.revenuecat.ios, 'ok');
  assert.match(r.revenuecat.android, /^error: /);
});

test('grant: both fail → 502 naming both, Firestore untouched, failure logged', async () => {
  const d = makeDeps({ iosFails: true, androidFails: true });
  await assert.rejects(
    grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now }),
    (e) => e.status === 502 && /RevenueCat grant failed: iOS: .*ios down; Android: .*android down/.test(e.message),
  );
  assert.equal(d.calls.some((c) => c[0] === 'setGrant'), false);
  assert.equal(d.log[0].result, 'failed');
});

test('grant: Firestore fails after RC → partial with error text', async () => {
  const d = makeDeps({ storeFails: true });
  const r = await grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now });
  assert.equal(r.partial, true);
  assert.deepEqual(r.revenuecat, { ios: 'ok', android: 'ok' });
  assert.match(r.firestore, /^error: firestore down/);
  assert.equal(d.log[0].result, 'partial');
});

test('grant: missing uid → 400', () =>
  assert.rejects(grantPro(makeDeps(), { duration: 'week', adminEmail: 'a@x.com', now }), (e) => e.status === 400));

test('grant: account lookup fails → 502, RC untouched, failure logged', async () => {
  const authDown = Object.assign(new Error('auth down'), { code: 'auth/internal-error' });
  const d = makeDeps({ authError: authDown });
  await assert.rejects(grantPro(d, { uid: 'u1', duration: 'week', adminEmail: 'a@x.com', now }), (e) => e.status === 502);
  assert.deepEqual(d.calls, []);
  assert.equal(d.log[0].result, 'failed');
});

test('revoke: both RC projects then Firestore', async () => {
  const d = makeDeps();
  const r = await revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { revenuecat: { ios: 'ok', android: 'ok' }, firestore: 'ok', partial: false });
  assert.deepEqual(names(d), ['ios:revoke', 'android:revoke', 'revokeGrant']);
  assert.deepEqual(d.calls[2], ['revokeGrant', 'u1', { revokedBy: 'a@x.com', revokedAt: new Date(now).toISOString() }]);
  assert.equal(d.log[0].result, 'ok');
});

test('revoke: one project fails → partial, Firestore still revoked', async () => {
  const d = makeDeps({ androidFails: true });
  const r = await revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now });
  assert.equal(r.partial, true);
  assert.equal(r.revenuecat.ios, 'ok');
  assert.match(r.revenuecat.android, /^error: /);
  assert.equal(r.firestore, 'ok');
  assert.equal(d.log[0].result, 'partial');
});

test('revoke: both fail → 502, Firestore untouched, failure logged', async () => {
  const d = makeDeps({ iosFails: true, androidFails: true });
  await assert.rejects(
    revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now }),
    (e) => e.status === 502 && /RevenueCat revoke failed: iOS: .*; Android: /.test(e.message),
  );
  assert.equal(d.calls.some((c) => c[0] === 'revokeGrant'), false);
  assert.equal(d.log[0].result, 'failed');
});

test('revoke: account lookup fails → 502, RC untouched, failure logged', async () => {
  const authDown = Object.assign(new Error('auth down'), { code: 'auth/internal-error' });
  const d = makeDeps({ authError: authDown });
  await assert.rejects(revokePro(d, { uid: 'u1', adminEmail: 'a@x.com', now }), (e) => e.status === 502);
  assert.deepEqual(d.calls, []);
  assert.equal(d.log[0].result, 'failed');
});

const playSub = {
  subscriptions: {
    play_m: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.1' },
    ios_m: { store: 'app_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: '2000' },
    play_r: { store: 'play_store', expires_date: '2026-11-01T00:00:00Z', store_transaction_id: 'GPA.9', refunded_at: '2026-09-20T00:00:00Z' },
  },
};

test('refund: Play transaction → refunded + logged, only the Android project is used', async () => {
  const d = makeDeps({ subscriber: playSub });
  const r = await refundPlay(d, { uid: 'u1', storeTransactionId: 'GPA.1', adminEmail: 'a@x.com', now });
  assert.deepEqual(r, { refunded: true, product: 'play_m' });
  assert.deepEqual(d.calls.at(-1), ['android:refund', 'u1', 'GPA.1']);
  assert.equal(d.calls.some((c) => c[0].startsWith('ios:')), false);
  assert.equal(d.log[0].action, 'refund');
});

for (const [label, tx] of [['App Store', '2000'], ['already refunded', 'GPA.9'], ['not this customer', 'GPA.404']]) {
  test(`refund rejects ${label} with 400 before calling RevenueCat refund`, async () => {
    const d = makeDeps({ subscriber: playSub });
    await assert.rejects(refundPlay(d, { uid: 'u1', storeTransactionId: tx, adminEmail: 'a@x.com', now }), (e) => e.status === 400);
    assert.equal(d.calls.some((c) => c[0].endsWith(':refund')), false);
  });
}
