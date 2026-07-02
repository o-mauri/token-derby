import { getOrgSchedule } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function orgScheduleGetCommand(orgName: string | undefined): Promise<number> {
  if (!orgName) {
    console.error('Usage: token-derby organisation schedule get <org-name>');
    return 2;
  }
  try {
    const resp = await getOrgSchedule(orgName);
    if (resp.schedule) {
      const s = resp.schedule;
      console.log(`Schedule for ${orgName}: days [${s.weekdays.join(',')}] ${s.start_local}–${s.end_local} ${s.tz}`);
      if (s.primary_top5) console.log('  Primary top-5 conversations cap: ON.');
    } else {
      console.log(`No schedule configured for ${orgName}.`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
