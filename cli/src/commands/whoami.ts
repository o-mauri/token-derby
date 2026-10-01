import { getJockey } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { CREDENTIAL_DEAD_MESSAGE } from '../ui/messages.js';

export type WhoamiDeps = {
  apiGetJockey?: typeof getJockey;
};

export async function whoamiCommand(deps: WhoamiDeps = {}): Promise<number> {
  const apiGetJockey = deps.apiGetJockey ?? getJockey;

  let me: Awaited<ReturnType<typeof apiGetJockey>>;
  try {
    me = await apiGetJockey();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'UNAUTHENTICATED') {
        console.error(CREDENTIAL_DEAD_MESSAGE);
        return 1;
      }
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  console.log('');
  console.log(`  ${me.display_name}`);
  if (me.email) console.log(`  ${me.email}`);
  if (me.device_label) console.log(`  this machine: ${me.device_label}`);
  console.log('');
  return 0;
}
