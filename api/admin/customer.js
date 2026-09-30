import { withAdmin } from '../_lib/with-admin.js';
import { getCustomer } from '../_lib/actions.js';

export default withAdmin('GET', async ({ req, deps, now }) => ({ body: await getCustomer(deps, req.query.q, now) }));
