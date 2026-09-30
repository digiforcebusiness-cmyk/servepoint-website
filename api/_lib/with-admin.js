import { HttpError, sendError } from './http.js';
import { requireAdmin } from './auth.js';
import { getDeps } from './deps.js';

/** Wraps a Vercel handler: method check → admin check → fn({ req, deps, adminEmail, now }). */
export function withAdmin(method, fn, getDepsFn = getDeps) {
  return async (req, res) => {
    try {
      if (req.method !== method) throw new HttpError(405, 'Method not allowed');
      const deps = getDepsFn();
      const adminEmail = await requireAdmin(req, {
        verifyIdToken: (t) => deps.auth.verifyIdToken(t),
        adminEmails: deps.adminEmails,
      });
      const { status = 200, body } = await fn({ req, deps, adminEmail, now: Date.now() });
      res.status(status).json(body);
    } catch (e) {
      sendError(res, e);
    }
  };
}
