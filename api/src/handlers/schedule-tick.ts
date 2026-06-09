import type { ScheduledHandler } from 'aws-lambda';
import { listAllSchedules, tryClaimMaterialised } from '../db/schedules.js';
import { getOrganisationById } from '../db/organisations.js';
import { isoWeekdayInTz, localDateInTz, localDateTimeToUtcMs } from '../lib/tz.js';
import { createRace } from '../lib/create-race.js';

// Fired every minute by EventBridge. Materialises any schedule whose current
// local time is inside an active weekday's window and not yet created today.
export const handler: ScheduledHandler = async () => {
  const now = new Date();
  const nowMs = now.getTime();
  const schedules = await listAllSchedules();

  for (const sched of schedules) {
    try {
      const localDate = localDateInTz(now, sched.tz);
      if (sched.last_materialised_date === localDate) continue;

      const weekday = isoWeekdayInTz(now, sched.tz);
      if (!sched.weekdays.includes(weekday)) continue;

      const startMs = localDateTimeToUtcMs(localDate, sched.start_local, sched.tz);
      const endMs = localDateTimeToUtcMs(localDate, sched.end_local, sched.tz);
      if (!(nowMs >= startMs && nowMs < endMs)) continue;

      // Claim today before creating: at-most-once. A duplicate tick or retry
      // fails the claim and skips. The overlap guard in createRace is a backstop.
      const claimed = await tryClaimMaterialised(sched.org_id, localDate);
      if (!claimed) continue;

      const org = await getOrganisationById(sched.org_id);
      if (!org) {
        console.warn('schedule references missing org', { org_id: sched.org_id });
        continue;
      }

      const result = await createRace({
        name: sched.race_name ?? `${org.org_name} ${localDate}`,
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
        tz: sched.tz,
        max_participants: sched.max_participants,
        counts_input: sched.counts_input,
        creator_user_id: sched.creator_user_id,
        creator_user_name: sched.creator_user_name,
        org: {
          org_id: org.org_id,
          org_name: org.org_name,
          webhook_url: org.webhook_url,
          webhook_secret: org.webhook_secret,
        },
      });

      if (result.ok) {
        console.log('scheduled race created', { org_id: sched.org_id, race_id: result.race_id, join_code: result.join_code, localDate });
      } else {
        console.warn('scheduled race not created', { org_id: sched.org_id, code: result.code, message: result.message });
      }
    } catch (e) {
      console.warn('schedule tick error', { org_id: sched.org_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
};
