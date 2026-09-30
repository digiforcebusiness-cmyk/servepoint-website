import { PRO_ENTITLEMENT } from './revenuecat.js';

export const PRO_STATUSES = ['active', 'trial', 'cancelled', 'owned'];

const ms = (iso) => (iso ? Date.parse(iso) : null);

function subscriptionStatus(s, now) {
  if (s.refunded_at) return 'refunded';
  const end = ms(s.expires_date);
  if (end !== null && end <= now) return 'expired';
  if (s.period_type === 'trial') return 'trial';
  if (s.unsubscribe_detected_at) return 'cancelled';
  return 'active';
}

/** Flattens a RevenueCat v1 `subscriber` into dashboard entries. */
export function normalizeRcSubscriber(sub, now) {
  const subs = Object.entries(sub.subscriptions || {}).map(([product, s]) => ({
    product,
    store: s.store,
    status: subscriptionStatus(s, now),
    periodEnd: s.expires_date ?? null,
    purchasedAt: s.purchase_date ?? null,
    storeTransactionId: s.store_transaction_id ?? null,
    sandbox: !!s.is_sandbox,
  }));
  const oneTime = Object.entries(sub.non_subscriptions || {}).flatMap(([product, list]) =>
    list.map((p) => ({
      product,
      store: p.store,
      status: p.refunded_at ? 'refunded' : 'owned',
      periodEnd: null,
      purchasedAt: p.purchase_date ?? null,
      storeTransactionId: p.store_transaction_id ?? null,
      sandbox: !!p.is_sandbox,
    })),
  );
  const ent = sub.entitlements?.[PRO_ENTITLEMENT];
  return {
    firstSeen: sub.first_seen ?? null,
    email: sub.subscriber_attributes?.$email?.value ?? null,
    entitlementActive: !!ent && (ent.expires_date == null || Date.parse(ent.expires_date) > now),
    subscriptions: [...subs, ...oneTime].map((e) => ({
      ...e,
      refundable: e.store === 'play_store' && e.status !== 'refunded' && !!e.storeTransactionId,
    })),
  };
}

/** Merges normalized RevenueCat results from several projects into one; null if there are none. */
export function mergeRcSubscribers(list) {
  const present = list.filter(Boolean);
  if (!present.length) return null;
  const seen = present.map((r) => r.firstSeen).filter(Boolean).sort();
  return {
    firstSeen: seen[0] ?? null,
    email: present.map((r) => r.email).find(Boolean) ?? null,
    entitlementActive: present.some((r) => r.entitlementActive),
    subscriptions: present.flatMap((r) => r.subscriptions),
  };
}

export function isGrantActive(grant, now) {
  return !!grant && grant.active === true && (grant.expiresAt == null || Date.parse(grant.expiresAt) > now);
}

/** One customer across RevenueCat, the Windows purchase record and admin grants. */
export function buildCustomerRecord({ uid, authUser, rc, windows, grant, now }) {
  const sources = new Set();
  for (const s of rc?.subscriptions ?? []) {
    if (PRO_STATUSES.includes(s.status)) sources.add(s.store === 'promotional' ? 'grant' : s.store);
  }
  if (windows?.active) sources.add('windows');
  if (isGrantActive(grant, now)) sources.add('grant');
  return {
    uid,
    email: authUser?.email ?? rc?.email ?? windows?.email ?? null,
    createdAt: authUser?.createdAt ?? rc?.firstSeen ?? null,
    isPro: sources.size > 0,
    proSources: [...sources].sort(),
    subscriptions: rc?.subscriptions ?? [],
    windows: windows ?? null,
    grant: grant ? { ...grant, isActive: isGrantActive(grant, now) } : null,
  };
}
