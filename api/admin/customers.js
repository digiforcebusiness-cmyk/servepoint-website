import { withAdmin } from '../_lib/with-admin.js';
import { listCustomers } from '../_lib/actions.js';

export default withAdmin('GET', async ({ req, deps, now }) => ({
  body: await listCustomers(deps, { source: req.query.source || 'revenuecat', cursor: req.query.cursor || undefined }, now),
}));
