import { HttpError } from './http.js';
import { resolveCustomerId, userExists } from './resolve.js';
import { normalizeRcSubscriber, buildCustomerRecord } from './customer.js';

const settle = (p) => p.then((value) => ({ value }), (e) => ({ error: e?.message || String(e) }));

export async function getCustomer(deps, q, now) {
  const { uid, authUser } = await resolveCustomerId(q, deps);
  const [rc, windows, grant] = await Promise.all([
    settle(deps.rc.getSubscriber(uid)),
    settle(deps.store.getWindows(uid)),
    settle(deps.store.getGrant(uid)),
  ]);
  const record = buildCustomerRecord({
    uid,
    authUser,
    rc: rc.value ? normalizeRcSubscriber(rc.value, now) : null,
    windows: windows.value ?? null,
    grant: grant.value ?? null,
    now,
  });
  return {
    ...record,
    errors: { revenuecat: rc.error ?? null, firestore: windows.error ?? grant.error ?? null },
  };
}

export const LIFETIME_END_MS = Date.UTC(2200, 0, 1);
const GRANT_DAYS = { week: 7, month: 30, year: 365 };
const DAY_MS = 86400000;

export function grantEnd(duration, now) {
  if (duration === 'lifetime') return { endMs: LIFETIME_END_MS, expiresAt: null };
  const days = GRANT_DAYS[duration];
  if (!days) throw new HttpError(400, `Unknown duration "${duration}"`);
  const endMs = now + days * DAY_MS;
  return { endMs, expiresAt: new Date(endMs).toISOString() };
}

async function writeLog(deps, entry) {
  try {
    await deps.store.addLog(entry);
  } catch (e) {
    console.error('admin_log write failed', e);
  }
}

const requireUid = (uid) => {
  if (!uid || typeof uid !== 'string') throw new HttpError(400, 'Missing customer id');
};

export async function grantPro(deps, { uid, duration, note, adminEmail, now }) {
  requireUid(uid);
  const { endMs, expiresAt } = grantEnd(duration, now);
  const base = { action: 'grant', targetUid: uid, adminEmail, at: new Date(now).toISOString(), details: { duration, note: note ?? '' } };
  const hasFirebaseUser = await userExists(deps.auth, uid);
  try {
    await deps.rc.grantPromotional(uid, endMs);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw new HttpError(502, `RevenueCat grant failed: ${e.message}`);
  }
  let firestore = 'skipped';
  if (hasFirebaseUser) {
    try {
      await deps.store.setGrant(uid, { active: true, expiresAt, note: note ?? '', grantedBy: adminEmail, grantedAt: new Date(now).toISOString() });
      firestore = 'ok';
    } catch (e) {
      firestore = `error: ${e.message}`;
    }
  }
  const partial = firestore.startsWith('error');
  await writeLog(deps, { ...base, result: partial ? 'partial' : 'ok', firestore });
  return { revenuecat: 'ok', firestore, partial, expiresAt };
}

export async function revokePro(deps, { uid, adminEmail, now }) {
  requireUid(uid);
  const base = { action: 'revoke', targetUid: uid, adminEmail, at: new Date(now).toISOString(), details: {} };
  const hasFirebaseUser = await userExists(deps.auth, uid);
  try {
    await deps.rc.revokePromotionals(uid);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw new HttpError(502, `RevenueCat revoke failed: ${e.message}`);
  }
  let firestore = 'skipped';
  if (hasFirebaseUser) {
    try {
      await deps.store.revokeGrant(uid, { revokedBy: adminEmail, revokedAt: new Date(now).toISOString() });
      firestore = 'ok';
    } catch (e) {
      firestore = `error: ${e.message}`;
    }
  }
  const partial = firestore.startsWith('error');
  await writeLog(deps, { ...base, result: partial ? 'partial' : 'ok', firestore });
  return { revenuecat: 'ok', firestore, partial };
}

export async function refundPlay(deps, { uid, storeTransactionId, adminEmail, now }) {
  requireUid(uid);
  if (!storeTransactionId) throw new HttpError(400, 'Missing transaction id');
  const sub = normalizeRcSubscriber(await deps.rc.getSubscriber(uid), now);
  const tx = sub.subscriptions.find((s) => s.storeTransactionId === storeTransactionId);
  if (!tx) throw new HttpError(400, 'That transaction does not belong to this customer');
  if (!tx.refundable) {
    throw new HttpError(400, tx.store === 'play_store'
      ? 'This Google Play purchase is already refunded'
      : 'Only Google Play purchases can be refunded here — use the store console');
  }
  const base = { action: 'refund', targetUid: uid, adminEmail, at: new Date(now).toISOString(), details: { storeTransactionId, product: tx.product } };
  try {
    await deps.rc.refundTransaction(uid, storeTransactionId);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw e;
  }
  await writeLog(deps, { ...base, result: 'ok' });
  return { refunded: true, product: tx.product };
}
