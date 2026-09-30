import { HttpError } from './http.js';

const NOT_FOUND = new Set(['auth/user-not-found', 'auth/invalid-uid', 'auth/invalid-email']);
const isNotFound = (e) => NOT_FOUND.has(e?.code);

const toAuthUser = (u) => ({
  email: u.email ?? null,
  createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
});

export async function userExists(auth, uid) {
  try {
    await auth.getUser(uid);
    return true;
  } catch (e) {
    if (isNotFound(e)) return false;
    throw e;
  }
}

/**
 * Turns a search query into a customer id. Only real Firebase users and
 * RevenueCat anonymous ids resolve — RevenueCat's v1 GET creates a customer
 * for any unknown id, so arbitrary text must never reach it.
 */
export async function resolveCustomerId(q, { auth }) {
  const query = (q || '').trim();
  if (!query) throw new HttpError(400, 'Enter an email or customer ID');
  if (query.includes('@')) {
    try {
      const u = await auth.getUserByEmail(query);
      return { uid: u.uid, authUser: toAuthUser(u) };
    } catch (e) {
      if (isNotFound(e)) throw new HttpError(404, `No ServePoint account with email ${query}`);
      throw e;
    }
  }
  try {
    const u = await auth.getUser(query);
    return { uid: u.uid, authUser: toAuthUser(u) };
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  if (query.startsWith('$RCAnonymousID:')) return { uid: query, authUser: null };
  throw new HttpError(404, `No customer matches "${query}"`);
}
