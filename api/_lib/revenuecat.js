import { HttpError } from './http.js';

export const PRO_ENTITLEMENT = 'ServePoint Pro';

/**
 * RevenueCat REST client. v1 (secret key) for per-customer reads, promotional
 * grants and Google Play refunds; v2 for the customer list and metrics.
 */
export function createRevenueCat({ v1Key, v2Key, projectId, fetch = globalThis.fetch }) {
  async function call(url, key, init = {}) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) {
      throw new HttpError(502, `RevenueCat ${res.status}: ${body?.message ?? text.slice(0, 200)}`);
    }
    return body;
  }
  const v1 = (path, init) => call(`https://api.revenuecat.com/v1${path}`, v1Key, init);
  const v2 = (path, init) =>
    call(`https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}${path}`, v2Key, init);
  const sub = (id) => `/subscribers/${encodeURIComponent(id)}`;
  const ent = `/entitlements/${encodeURIComponent(PRO_ENTITLEMENT)}`;

  return {
    getSubscriber: async (id) => (await v1(sub(id))).subscriber,
    grantPromotional: (id, endTimeMs) =>
      v1(`${sub(id)}${ent}/promotional`, { method: 'POST', body: JSON.stringify({ end_time_ms: endTimeMs }) }),
    revokePromotionals: (id) => v1(`${sub(id)}${ent}/revoke_promotionals`, { method: 'POST' }),
    refundTransaction: (id, storeTransactionId) =>
      v1(`${sub(id)}/transactions/${encodeURIComponent(storeTransactionId)}/refund`, { method: 'POST' }),
    listCustomers: ({ limit = 50, startingAfter } = {}) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (startingAfter) q.set('starting_after', startingAfter);
      return v2(`/customers?${q}`);
    },
    metricsOverview: () => v2('/metrics/overview'),
  };
}
