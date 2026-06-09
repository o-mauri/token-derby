import { setOrgSchedule } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { parseWeekdays } from '@token-derby/shared';

function flag(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1];
    const eq = `${name}=`;
    if (args[i]?.startsWith(eq)) return args[i]!.slice(eq.length);
  }
  return undefined;
}

const USAGE = 'Usage: token-derby organisation schedule set <org-name> --days mon-fri --start 09:00 --end 17:30 --tz Europe/London [--name "Daily"] [--max 30] [--counts-input]';

export async function orgScheduleSetCommand(orgName: string | undefined, rest: string[]): Promise<number> {
  if (!orgName) {
    console.error(USAGE);
    return 2;
  }
  const daysSpec = flag(rest, '--days');
  const start = flag(rest, '--start');
  const end = flag(rest, '--end');
  const tz = flag(rest, '--tz');
  const name = flag(rest, '--name');
  const maxStr = flag(rest, '--max');
  const counts_input = rest.includes('--counts-input');

  if (!daysSpec || !start || !end || !tz) {
    console.error('Required flags: --days, --start, --end, --tz');
    console.error(USAGE);
    return 2;
  }
  const weekdays = parseWeekdays(daysSpec);
  if (!weekdays) {
    console.error('Invalid --days. Use day names like "mon-fri" or "mon,wed,fri".');
    return 2;
  }
  let max_participants: number | undefined;
  if (maxStr !== undefined) {
    max_participants = Number(maxStr);
    if (!Number.isInteger(max_participants) || max_participants < 1) {
      console.error('--max must be a positive integer');
      return 2;
    }
  }

  try {
    const resp = await setOrgSchedule(orgName, {
      weekdays,
      start_local: start,
      end_local: end,
      tz,
      ...(name ? { race_name: name } : {}),
      ...(max_participants !== undefined ? { max_participants } : {}),
      ...(counts_input ? { counts_input: true } : {}),
    });
    const s = resp.schedule;
    console.log(`Schedule set for ${orgName}: days [${s.weekdays.join(',')}] ${s.start_local}–${s.end_local} ${s.tz}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
}
