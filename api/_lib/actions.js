import { resolveCustomerId } from './resolve.js';
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
