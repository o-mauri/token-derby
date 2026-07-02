import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { createRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function createRaceCommand(organisationName?: string): Promise<number> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question('Race name: ')).trim();
    if (!name) { console.error('Name required.'); return 1; }

    const startRaw = (await rl.question('Start time (ISO 8601, blank = now): ')).trim();
    const start = startRaw ? startRaw : new Date().toISOString();
    if (!isIso(start)) { console.error('Invalid start time.'); return 1; }

    const durationRaw = (await rl.question('Race duration (hours): ')).trim();
    const durationHours = parseFloat(durationRaw);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      console.error('Duration must be a positive number of hours.'); return 1;
    }
    const end = new Date(new Date(start).getTime() + durationHours * 3600_000).toISOString();

    const tz = (await rl.question(`Time zone [${DEFAULT_TZ}]: `)).trim() || DEFAULT_TZ;
    const maxRaw = (await rl.question('Max participants [30]: ')).trim();
    const max = maxRaw ? parseInt(maxRaw, 10) : undefined;
    if (max !== undefined && (!Number.isFinite(max) || max < 1)) {
      console.error('Max participants must be a positive number.'); return 1;
    }

    let org = organisationName;
    if (org === undefined) {
      const raw = (await rl.question('Organisation (blank for none): ')).trim();
      if (raw) org = raw;
    }
    if (org !== undefined && !ORG_NAME_PATTERN.test(org)) {
      console.error('Organisation name must be 1–12 alphanumeric characters.');
      return 1;
    }

    const countInputRaw = (await rl.question('Count input tokens (fresh input + cache creation) toward race totals? [y/N]: ')).trim().toLowerCase();
    const counts_input = countInputRaw === 'y' || countInputRaw === 'yes';

    const top5Raw = (await rl.question('Count only each racer\'s 5 most-active conversations toward their primary model\'s score? [y/N]: ')).trim().toLowerCase();
    const primary_top5 = top5Raw === 'y' || top5Raw === 'yes';

    const resp = await createRace({
      name, start_time: start, end_time: end, tz,
      ...(max !== undefined ? { max_participants: max } : {}),
      ...(org ? { organisation_name: org } : {}),
      ...(counts_input ? { counts_input: true } : {}),
      ...(primary_top5 ? { primary_top5: true } : {}),
    });

    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log(`  ║   JOIN CODE:  ${resp.join_code.padEnd(23)}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    console.log(`  Admin code:  ${resp.admin_code}`);
    console.log('  ⚠  Save the admin code — you need it to end the race early.');
    console.log('');
    if (org) {
      console.log(`  Restricted to organisation: ${org}`);
    }
    if (counts_input) {
      console.log('  Counting input + output tokens (excluding cache reads).');
    }
    if (primary_top5) {
      console.log('  Primary score counts only each racer\'s top 5 conversations per beat.');
    }
    console.log(`  Share with participants:  token-derby join ${resp.join_code}`);
    return 0;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  } finally {
    rl.close();
  }
}

function isIso(s: string): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}
