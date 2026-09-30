import { withAdmin } from '../_lib/with-admin.js';
import { refundPlay } from '../_lib/actions.js';

export default withAdmin('POST', async ({ req, deps, adminEmail, now }) => {
  const { uid, storeTransactionId } = req.body || {};
  return { body: await refundPlay(deps, { uid, storeTransactionId, adminEmail, now }) };
});
