import { HttpError } from './http.js';
import { resolveCustomerId, userExists } from './resolve.js';
import { normalizeRcSubscriber, mergeRcSubscribers, buildCustomerRecord, isGrantActive } from './customer.js';

const settle = (p) => p.then((value) => ({ value }), (e) => ({ error: e?.message || String(e) }));

const joinErrors = (byProject) => {
  const parts = Object.entries(byProject).filter(([, e]) => e).map(([name, e]) => `${name}: ${e}`);
  return parts.length ? parts.join('; ') : null;
};

/** Runs one RevenueCat step on both projects in sequence (iOS, then Android), each in its own try/catch. */
async function onBothProjects(deps, step) {
  const out = { ios: 'ok', android: 'ok' };
  const errors = {};
  for (const [key, name] of [['ios', 'iOS'], ['android', 'Android']]) {
    try {
      await step(deps.rc[key]);
    } catch (e) {
      out[key] = `error: ${e.message}`;
      errors[name] = e.message;
    }
  }
  return { revenuecat: out, errors, allFailed: Object.keys(errors).length === 2 };
}

export async function getCustomer(deps, q, now) {
  const { uid, authUser } = await resolveCustomerId(q, deps);
  const [ios, android, windows, grant] = await Promise.all([
    settle(deps.rc.ios.getSubscriber(uid)),
    settle(deps.rc.android.getSubscriber(uid)),
    settle(deps.store.getWindows(uid)),
    settle(deps.store.getGrant(uid)),
  ]);
  const record = buildCustomerRecord({
    uid,
    authUser,
    rc: mergeRcSubscribers([ios, android].map((r) => (r.value ? normalizeRcSubscriber(r.value, now) : null))),
    windows: windows.value ?? null,
    grant: grant.value ?? null,
    now,
  });
  return {
    ...record,
    errors: { revenuecat: joinErrors({ iOS: ios.error, Android: android.error }), firestore: windows.error ?? grant.error ?? null },
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
  let hasFirebaseUser;
  try {
    hasFirebaseUser = await userExists(deps.auth, uid);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw new HttpError(502, `Could not check the customer account: ${e.message}`);
  }
  const rc = await onBothProjects(deps, (client) => client.grantPromotional(uid, endMs));
  if (rc.allFailed) {
    const error = joinErrors(rc.errors);
    await writeLog(deps, { ...base, result: 'failed', error, revenuecat: rc.revenuecat });
    throw new HttpError(502, `RevenueCat grant failed: ${error}`);
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
  const partial = Object.keys(rc.errors).length > 0 || firestore.startsWith('error');
  await writeLog(deps, { ...base, result: partial ? 'partial' : 'ok', revenuecat: rc.revenuecat, firestore });
  return { revenuecat: rc.revenuecat, firestore, partial, expiresAt };
}

export async function revokePro(deps, { uid, adminEmail, now }) {
  requireUid(uid);
  const base = { action: 'revoke', targetUid: uid, adminEmail, at: new Date(now).toISOString(), details: {} };
  let hasFirebaseUser;
  try {
    hasFirebaseUser = await userExists(deps.auth, uid);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw new HttpError(502, `Could not check the customer account: ${e.message}`);
  }
  const rc = await onBothProjects(deps, (client) => client.revokePromotionals(uid));
  if (rc.allFailed) {
    const error = joinErrors(rc.errors);
    await writeLog(deps, { ...base, result: 'failed', error, revenuecat: rc.revenuecat });
    throw new HttpError(502, `RevenueCat revoke failed: ${error}`);
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
  const partial = Object.keys(rc.errors).length > 0 || firestore.startsWith('error');
  await writeLog(deps, { ...base, result: partial ? 'partial' : 'ok', revenuecat: rc.revenuecat, firestore });
  return { revenuecat: rc.revenuecat, firestore, partial };
}

export async function refundPlay(deps, { uid, storeTransactionId, adminEmail, now }) {
  requireUid(uid);
  if (!storeTransactionId) throw new HttpError(400, 'Missing transaction id');
  const sub = normalizeRcSubscriber(await deps.rc.android.getSubscriber(uid), now);
  const tx = sub.subscriptions.find((s) => s.storeTransactionId === storeTransactionId);
  if (!tx) throw new HttpError(400, 'That transaction does not belong to this customer');
  if (!tx.refundable) {
    throw new HttpError(400, tx.store === 'play_store'
      ? 'This Google Play purchase is already refunded'
      : 'Only Google Play purchases can be refunded here — use the store console');
  }
  const base = { action: 'refund', targetUid: uid, adminEmail, at: new Date(now).toISOString(), details: { storeTransactionId, product: tx.product } };
  try {
    await deps.rc.android.refundTransaction(uid, storeTransactionId);
  } catch (e) {
    await writeLog(deps, { ...base, result: 'failed', error: e.message });
    throw e;
  }
  await writeLog(deps, { ...base, result: 'ok' });
  return { refunded: true, product: tx.product };
}

const PAGE = 50;
const isoMs = (v) => (v == null ? null : new Date(v).toISOString());
const OVERVIEW_METRICS = ['active_subscriptions', 'active_trials', 'mrr', 'revenue'];

async function emailsFor(auth, uids) {
  const real = uids.filter((u) => !u.startsWith('$RCAnonymousID:'));
  if (!real.length) return new Map();
  const { users } = await auth.getUsers(real.map((uid) => ({ uid })));
  return new Map(users.map((u) => [u.uid, u.email ?? null]));
}

export async function listCustomers(deps, { source = 'ios', cursor } = {}, now) {
  if (source === 'ios' || source === 'android') {
    const page = await deps.rc[source].listCustomers({ limit: PAGE, startingAfter: cursor });
    const items = page.items ?? [];
    const emails = await emailsFor(deps.auth, items.map((c) => c.id));
    const rows = items.map((c) => {
      const ents = c.active_entitlements?.items ?? [];
      const lifetime = ents.some((e) => e.expires_at == null);
      const latest = ents.length && !lifetime ? Math.max(...ents.map((e) => e.expires_at)) : null;
      return {
        uid: c.id,
        email: emails.get(c.id) ?? null,
        isPro: ents.length > 0,
        plan: null,
        proUntil: isoMs(latest),
        firstSeen: isoMs(c.first_seen_at),
        lastSeen: isoMs(c.last_seen_at),
      };
    });
    const nextCursor = page.next_page
      ? new URL(page.next_page, 'https://api.revenuecat.com').searchParams.get('starting_after')
      : null;
    return { rows, nextCursor };
  }
  if (source === 'windows') {
    const { items, nextCursor } = await deps.store.listWindows({ limit: PAGE, after: cursor });
    return {
      rows: items.map((w) => ({
        uid: w.uid, email: w.email ?? null, isPro: w.active === true, plan: `windows · ${w.product}`,
        proUntil: null, firstSeen: w.firstSeenAt ?? null, lastSeen: w.lastCheckedAt ?? null,
      })),
      nextCursor,
    };
  }
  if (source === 'grants') {
    const { items, nextCursor } = await deps.store.listGrants({ limit: PAGE, after: cursor });
    const emails = await emailsFor(deps.auth, items.map((g) => g.uid));
    return {
      rows: items.map((g) => ({
        uid: g.uid, email: emails.get(g.uid) ?? null, isPro: isGrantActive(g, now),
        plan: `grant · ${g.expiresAt ? 'timed' : 'lifetime'}`, proUntil: g.expiresAt ?? null,
        firstSeen: g.grantedAt ?? null, lastSeen: null,
      })),
      nextCursor,
    };
  }
  throw new HttpError(400, `Unknown source "${source}"`);
}

function pickMetrics(rc) {
  if (!rc.value) return null;
  const metrics = {};
  for (const id of OVERVIEW_METRICS) {
    const m = rc.value.metrics?.find((x) => x.id === id);
    metrics[id] = m ? { value: m.value, unit: m.unit } : null;
  }
  return { currency: rc.value.currency ?? null, metrics };
}

export async function getOverview(deps, now) {
  const d = new Date(now);
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const [ios, android, windows] = await Promise.all([
    settle(deps.rc.ios.metricsOverview()),
    settle(deps.rc.android.metricsOverview()),
    settle(deps.store.countWindows({ monthStart })),
  ]);
  return {
    ios: pickMetrics(ios),
    android: pickMetrics(android),
    windows: windows.value ?? null,
    errors: { ios: ios.error ?? null, android: android.error ?? null, firestore: windows.error ?? null },
  };
}
