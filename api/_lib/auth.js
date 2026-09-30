import { HttpError } from './http.js';

export function parseAdminEmails(raw) {
  return (raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Verifies the Firebase ID token and the admin allowlist. Returns the admin's email. */
export async function requireAdmin(req, { verifyIdToken, adminEmails }) {
  const match = /^Bearer (.+)$/.exec(req.headers?.authorization || '');
  if (!match) throw new HttpError(401, 'Missing sign-in token');
  let claims;
  try {
    claims = await verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'Invalid or expired sign-in token');
  }
  const email = (claims.email || '').toLowerCase();
  if (claims.email_verified !== true || !adminEmails.includes(email)) {
    throw new HttpError(403, 'This account is not a ServePoint admin');
  }
  return email;
}
