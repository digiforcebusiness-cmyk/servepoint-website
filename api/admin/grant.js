import { withAdmin } from '../_lib/with-admin.js';
import { grantPro } from '../_lib/actions.js';

export default withAdmin('POST', async ({ req, deps, adminEmail, now }) => {
  const { uid, duration, note } = req.body || {};
  const result = await grantPro(deps, { uid, duration, note, adminEmail, now });
  return { status: result.partial ? 207 : 200, body: result };
});
