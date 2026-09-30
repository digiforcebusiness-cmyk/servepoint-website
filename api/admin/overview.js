import { withAdmin } from '../_lib/with-admin.js';
import { getOverview } from '../_lib/actions.js';

export default withAdmin('GET', async ({ deps, now }) => ({ body: await getOverview(deps, now) }));
