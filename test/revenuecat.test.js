import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevenueCat } from '../api/_lib/revenuecat.js';
import { HttpError } from '../api/_lib/http.js';

function fakeFetch(status = 200, body = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: status < 300, status, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}
const make = (f) => createRevenueCat({ v1Key: 'sk_v1', v2Key: 'sk_v2', projectId: 'proj1', fetch: f });

test('getSubscriber uses v1 key, encodes id, returns subscriber', async () => {
  const f = fakeFetch(200, { subscriber: { first_seen: 'x' } });
  const sub = await make(f).getSubscriber('$RCAnonymousID:abc');
  assert.equal(f.calls[0].url, 'https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aabc');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer sk_v1');
  assert.deepEqual(sub, { first_seen: 'x' });
});
test('grantPromotional URL-encodes the entitlement with a space', async () => {
  const f = fakeFetch(201, {});
  await make(f).grantPromotional('u1', 123);
  assert.equal(f.calls[0].url, 'https://api.revenuecat.com/v1/subscribers/u1/entitlements/ServePoint%20Pro/promotional');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { end_time_ms: 123 });
});
test('revokePromotionals and refundTransaction paths', async () => {
  const f = fakeFetch(200, {});
  const rc = make(f);
  await rc.revokePromotionals('u1');
  await rc.refundTransaction('u1', 'GPA.1-2');
  assert.equal(f.calls[0].url, 'https://api.revenuecat.com/v1/subscribers/u1/entitlements/ServePoint%20Pro/revoke_promotionals');
  assert.equal(f.calls[1].url, 'https://api.revenuecat.com/v1/subscribers/u1/transactions/GPA.1-2/refund');
});
test('listCustomers + metricsOverview use v2 key and project path', async () => {
  const f = fakeFetch(200, { items: [] });
  const rc = make(f);
  await rc.listCustomers({ startingAfter: 'c9' });
  await rc.metricsOverview();
  assert.equal(f.calls[0].url, 'https://api.revenuecat.com/v2/projects/proj1/customers?limit=50&starting_after=c9');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer sk_v2');
  assert.equal(f.calls[1].url, 'https://api.revenuecat.com/v2/projects/proj1/metrics/overview');
});
test('non-2xx → HttpError 502 with RevenueCat message', async () => {
  const f = fakeFetch(404, { message: 'Subscriber not found' });
  await assert.rejects(make(f).revokePromotionals('u1'),
    (e) => e instanceof HttpError && e.status === 502 && /404: Subscriber not found/.test(e.message));
});
