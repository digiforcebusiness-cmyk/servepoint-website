import { withAdmin } from '../_lib/with-admin.js';
import { revokePro } from '../_lib/actions.js';

export default withAdmin('POST', async ({ req, deps, adminEmail, now }) => {
  const { uid } = req.body || {};
  const result = await revokePro(deps, { uid, adminEmail, now });
  return { status: result.partial ? 207 : 200, body: result };
});
