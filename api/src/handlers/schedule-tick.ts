import type { ScheduledHandler } from 'aws-lambda';
import { listAllSchedules, tryClaimMaterialised } from '../db/schedules.js';
import { listAllLeagues } from '../db/leagues.js';
import { ensureLeagueSeason, tryClaimLeagueFixture, stampFinalFixtureEnd } from '../db/league-seasons.js';
import { getOrganisationById, listOrgsWithSlackDigest, markDigestSent } from '../db/organisations.js';
import { isoWeekdayInTz, localDateInTz, localDateTimeToUtcMs } from '../lib/tz.js';
import { createRace } from '../lib/create-race.js';
import { rolloverDueLeague } from '../lib/rollover-league.js';
import { buildOrgLeaderboard } from '../lib/org-leaderboard.js';
import { sendOrgDigest } from '../lib/slack/send.js';
import { leagueFixtureName } from '@token-derby/shared';

// Fired every minute by EventBridge. Materialises org races whose current local
// time is inside an active weekday's window and not yet created today — both
// repeating RaceSchedules and League fixtures (an org has at most one of the
// two). One tick handles both since the work is the same shape.
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
        primary_top5: sched.primary_top5,
        creator_user_id: sched.creator_user_id,
        creator_user_name: sched.creator_user_name,
        org: {
          org_id: org.org_id,
          org_name: org.org_name,
          webhook_url: org.webhook_url,
          webhook_secret: org.webhook_secret,
          slack: org.slack,
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

  // League fixtures. Same shape as the schedule loop above, plus per-season
  // bookkeeping (the LEAGUE#SEASON#<n> row) and round tagging/naming.
  const leagues = await listAllLeagues();
  for (const league of leagues) {
    try {
      // Rollover check runs ungated — a season can end on an off-day or outside
      // the fixture window, so this can't be gated behind the weekday/window
      // checks below. Wrapped so a rollover error can't abort materialisation
      // for this league (and vice-versa): uses the CURRENT league snapshot; a
      // bumped season is picked up on the next tick, not re-read here.
      try {
        const rolled = await rolloverDueLeague(league, now);
        if (rolled) {
          console.log('league season rolled over', { org_id: league.org_id, from_season: league.current_season });
        }
      } catch (e) {
        console.warn('league rollover error', { org_id: league.org_id, error: e instanceof Error ? e.message : String(e) });
      }

      const localDate = localDateInTz(now, league.tz);

      const weekday = isoWeekdayInTz(now, league.tz);
      if (!league.weekdays.includes(weekday)) continue;

      const startMs = localDateTimeToUtcMs(localDate, league.start_local, league.tz);
      const endMs = localDateTimeToUtcMs(localDate, league.end_local, league.tz);
      if (!(nowMs >= startMs && nowMs < endMs)) continue;

      const season = league.current_season;
      await ensureLeagueSeason(league.org_id, season);

      // Atomically claim today's fixture (at-most-once per day, capped at
      // races_per_season). round is the new fixture count; null ⇒ nothing to do.
      //
      // Claim-before-create (same trade-off as the schedule loop): the counter
      // is advanced before createRace so a duplicate/retried tick can never
      // double-create. The cost is that if createRace below fails (e.g. a manual
      // race overlaps the window, or a transient error), this round number is
      // spent with no race behind it and the season yields one fewer fixture.
      // For a league org this is nearly unreachable — mutual exclusivity means
      // the only races are league fixtures, each on a distinct day, so there is
      // nothing to overlap. We accept the rare gap rather than risk double-create.
      const round = await tryClaimLeagueFixture(league.org_id, season, localDate, league.races_per_season);
      if (round === null) continue;

      if (round === league.races_per_season) {
        await stampFinalFixtureEnd(league.org_id, season, new Date(endMs).toISOString());
      }

      const org = await getOrganisationById(league.org_id);
      if (!org) {
        console.warn('league references missing org', { org_id: league.org_id });
        continue;
      }

      const base = league.race_name ?? `${org.org_name} ${localDate}`;
      const result = await createRace({
        name: leagueFixtureName(base, round, league.races_per_season),
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
        tz: league.tz,
        max_participants: league.max_participants,
        counts_input: league.counts_input,
        primary_top5: league.primary_top5,
        creator_user_id: league.creator_user_id,
        creator_user_name: league.creator_user_name,
        org: {
          org_id: org.org_id,
          org_name: org.org_name,
          webhook_url: org.webhook_url,
          webhook_secret: org.webhook_secret,
          slack: org.slack,
        },
        league: { league_id: league.org_id, season, round },
      });

      if (result.ok) {
        console.log('league fixture created', { org_id: league.org_id, season, round, race_id: result.race_id, join_code: result.join_code, localDate });
      } else {
        console.warn('league fixture not created', { org_id: league.org_id, season, round, code: result.code, message: result.message });
      }
    } catch (e) {
      console.warn('league tick error', { org_id: league.org_id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Weekly Slack digests. Same at-most-once, weekday/time-gated shape as above.
  const digestOrgs = await listOrgsWithSlackDigest();
  for (const org of digestOrgs) {
    try {
      const d = org.slack?.digest;
      if (!org.slack?.messages.weekly_digest || !d) continue;
      const localDate = localDateInTz(now, d.tz);
      if (org.slack.digest_last_sent_date === localDate) continue;
      if (isoWeekdayInTz(now, d.tz) !== d.weekday) continue;
      const dueMs = localDateTimeToUtcMs(localDate, d.time_local, d.tz);
      if (nowMs < dueMs) continue;

      const claimed = await markDigestSent(org.org_id, localDate);
      if (!claimed) continue;

      const leaderboard = await buildOrgLeaderboard(org);
      if (leaderboard.horses.length === 0) {
        console.log('digest: org has no horses, skipping', { org_id: org.org_id });
        continue;
      }
      await sendOrgDigest(org, leaderboard);
      console.log('weekly digest sent', { org_id: org.org_id, localDate });
    } catch (e) {
      console.warn('digest tick error', { org_id: org.org_id, error: e instanceof Error ? e.message : String(e) });
    }
  }
};
