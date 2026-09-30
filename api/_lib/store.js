import { FieldPath, Timestamp } from 'firebase-admin/firestore';

const iso = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v ?? null);
const ts = (s) => (s ? Timestamp.fromDate(new Date(s)) : null);

const windowsFrom = (d) => {
  const x = d.data();
  return { uid: d.id, product: x.product ?? 'other', active: x.active === true, email: x.email ?? null, firstSeenAt: iso(x.firstSeenAt), lastCheckedAt: iso(x.lastCheckedAt) };
};
const grantFrom = (d) => {
  const x = d.data();
  return { uid: d.id, active: x.active === true, expiresAt: iso(x.expiresAt), note: x.note ?? '', grantedBy: x.grantedBy ?? null, grantedAt: iso(x.grantedAt), revokedBy: x.revokedBy ?? null, revokedAt: iso(x.revokedAt) };
};

/** Firestore access for the dashboard. Timestamps become ISO strings at this boundary. */
export function createStore(db) {
  const purchases = db.collection('store_purchases');
  const grants = db.collection('pro_grants');

  async function page(col, map, { limit, after }) {
    let q = col.orderBy(FieldPath.documentId()).limit(limit);
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    return { items: snap.docs.map(map), nextCursor: snap.docs.length === limit ? snap.docs.at(-1).id : null };
  }
  const count = async (q) => (await q.count().get()).data().count;

  return {
    async getWindows(uid) {
      const d = await purchases.doc(uid).get();
      return d.exists ? windowsFrom(d) : null;
    },
    async getGrant(uid) {
      const d = await grants.doc(uid).get();
      return d.exists ? grantFrom(d) : null;
    },
    setGrant: (uid, g) => grants.doc(uid).set({ ...g, expiresAt: ts(g.expiresAt), grantedAt: ts(g.grantedAt) }),
    revokeGrant: (uid, { revokedBy, revokedAt }) =>
      grants.doc(uid).set({ active: false, revokedBy, revokedAt: ts(revokedAt) }, { merge: true }),
    addLog: (entry) => db.collection('admin_log').add({ ...entry, at: ts(entry.at) }),
    listWindows: (opts) => page(purchases, windowsFrom, opts),
    listGrants: (opts) => page(grants, grantFrom, opts),
    async countWindows({ monthStart }) {
      const active = purchases.where('active', '==', true);
      const [monthly, lifetime, newThisMonth] = await Promise.all([
        count(active.where('product', '==', 'monthly')),
        count(active.where('product', '==', 'lifetime')),
        count(purchases.where('firstSeenAt', '>=', ts(monthStart))),
      ]);
      return { monthly, lifetime, newThisMonth };
    },
  };
}
