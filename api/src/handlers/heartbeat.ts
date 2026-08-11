import type { ApiHandler } from '../lib/http.js';
import type { HeartbeatRequest, HeartbeatResponse } from '@token-derby/shared';
import { minorMatches, MIDRACE_THRESHOLDS, scoreTick, scoredOf } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { getHorseForHeartbeat, applyHeartbeatDelta, listHorses } from '../db/horses.js';
import { appendSeriesPoint } from '../db/series.js';
import { evaluateAchievements } from '../lib/evaluate-achievements.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { clampDelta } from '../lib/rate-cap.js';
import { resolveHeartbeatDelta } from '../lib/weighting.js';
import { rankHorses } from '../lib/rank-horses.js';
import { finaliseRace } from '../lib/finalise-race.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';

export const handler: ApiHandler = async (event) => {
  const join_code = event.pathParameters?.join_code;
  const horse_id = event.pathParameters?.horse_id;
  if (!join_code || !horse_id) return err('BAD_REQUEST', 'path params required');

  const caller_version = readCliVersion(event);
  if (!caller_version || !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return err('INVALID_TOKEN', 'Authorization: Bearer required');

  const body = parseJson<HeartbeatRequest>(event.body);
  if (!body || typeof body.seq !== 'number' || !Number.isFinite(body.seq) || body.seq < 1) {
    return err('BAD_REQUEST', 'seq (>=1) required');
  }

  let race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  if (race.cli_version) {
    const cli_version = readCliVersion(event);
    if (!minorMatches(cli_version, race.cli_version)) {
      return err(
        'VERSION_MISMATCH',
        `Race requires token-derby v${race.cli_version}. ` +
          `Install: npm i -g @mauricode/token-derby@~${race.cli_version}`,
      );
    }
  }

  const horse = await getHorseForHeartbeat(race.race_id, horse_id, token);
  if (!horse) return err('INVALID_TOKEN', 'heartbeat token does not match');

  const primary = horse.primary_model ?? 'claude';
  const rawDelta = resolveHeartbeatDelta(body, primary);
  if (rawDelta === null) {
    return err('BAD_REQUEST', 'components or delta (>=0) required');
  }

  const now = new Date();
  const race_status = computeStatus(race, now);

  let horses;
  let effectiveLastSeq = horse.last_seq;
  if (race_status === 'finished' && !race.ended_at) {
    const result = await finaliseRace(race, now);
    race = result.race;
    horses = result.horses;
  } else if (race_status !== 'finished') {
    const prevTokens = horse.current_tokens;
    const elapsedMs = (() => {
      const prevMs = Date.parse(horse.last_heartbeat);
      return Number.isFinite(prevMs) ? now.getTime() - prevMs : 0;
    })();
    const applied = clampDelta({ delta: rawDelta, elapsedMs, counts_input: race.counts_input });
    const scoring = scoreTick({
      delta: applied,
      dt_ms: elapsedMs,
      race,
      state: { stamina: horse.stamina },
    });
    const scoredApplied = scoring.scored_delta;
    const newTokens = prevTokens + applied;
    const newScored = scoredOf(horse) + scoredApplied;

    const allHorsesBefore = await listHorses(race.race_id);
    const updatedHorses = allHorsesBefore.map(h =>
      h.horse_id === horse_id
        ? { ...h, current_tokens: newTokens, scored_tokens: newScored, stamina: scoring.state.stamina }
        : h,
    );
    const ranked = rankHorses(updatedHorses);
    const ownRanked = ranked.find(h => h.horse_id === horse_id)!;
    const second = ranked.find(h => h.rank === 2);
    const lastHeartbeatRaw = horse.last_heartbeat ? new Date(horse.last_heartbeat).getTime() : NaN;
    const lastHeartbeatMs = Number.isNaN(lastHeartbeatRaw) ? now.getTime() : lastHeartbeatRaw;
    const startMs = new Date(race.start_time).getTime();
    const endMs = new Date(race.end_time).getTime();
    const warmUpEnd = startMs + (endMs - startMs) * MIDRACE_THRESHOLDS.warm_up_fraction;
    const evalResult = evaluateAchievements({
      prev: {
        live_xp: horse.live_xp,
        last_rank: horse.last_rank,
        racer_streak_ms: horse.racer_streak_ms,
        racer_awards: horse.racer_awards,
        pacesetter_streak_ms: horse.pacesetter_streak_ms,
        pacesetter_awards: horse.pacesetter_awards,
        overtake_awards: horse.overtake_awards,
        lead_take_awards: horse.lead_take_awards,
        last_stampede_at: horse.last_stampede_at,
        was_in_last: horse.was_in_last,
        comeback_awarded: horse.comeback_awarded,
        last_gap_in_1st: horse.last_gap_in_1st,
        last_pulled_away_at: horse.last_pulled_away_at,
        recent_events: horse.recent_events,
      },
      now_ms: now.getTime(),
      last_heartbeat_at_ms: lastHeartbeatMs,
      current_tokens: newScored,
      prev_current_tokens: scoredOf(horse),
      new_rank: ownRanked.rank,
      total_horses: ranked.length,
      second_place_tokens: second ? scoredOf(second) : null,
      warm_up_active: now.getTime() < warmUpEnd,
      counts_input: race.counts_input ?? false,
    });

    const didApply = await applyHeartbeatDelta({
      race_id: race.race_id, horse_id, seq: body.seq, applied, scored_applied: scoredApplied,
      stamina: scoring.state.stamina, last_heartbeat: now.toISOString(), state: evalResult.next,
      needsSeed: horse.scored_tokens === undefined,
    });

    if (didApply) {
      if (applied > 0) {
        await appendSeriesPoint(race.race_id, horse_id, body.seq, { t: now.getTime(), d: applied });
      }
      effectiveLastSeq = body.seq;
      horses = updatedHorses.map(h =>
        h.horse_id === horse_id
          ? {
              ...h,
              current_tokens: newTokens,
              scored_tokens: newScored,
              stamina: scoring.state.stamina,
              last_seq: body.seq,
              live_xp: evalResult.next.live_xp,
              last_rank: evalResult.next.last_rank,
              racer_streak_ms: evalResult.next.racer_streak_ms,
              racer_awards: evalResult.next.racer_awards,
              pacesetter_streak_ms: evalResult.next.pacesetter_streak_ms,
              pacesetter_awards: evalResult.next.pacesetter_awards,
              overtake_awards: evalResult.next.overtake_awards,
              lead_take_awards: evalResult.next.lead_take_awards,
              last_stampede_at: evalResult.next.last_stampede_at,
              was_in_last: evalResult.next.was_in_last,
              comeback_awarded: evalResult.next.comeback_awarded,
              last_gap_in_1st: evalResult.next.last_gap_in_1st,
              last_pulled_away_at: evalResult.next.last_pulled_away_at,
              recent_events: evalResult.next.recent_events,
            }
          : h,
      );
    } else {
      effectiveLastSeq = horse.last_seq;
      horses = await listHorses(race.race_id);
    }
  } else {
    // Race was already finished before this call — no live update happened.
    horses = await listHorses(race.race_id);
  }

  const response: HeartbeatResponse = {
    race_status,
    server_time: now.toISOString(),
    time_left_seconds: timeLeftSeconds(race, now),
    horses: rankHorses(horses),
    race,
    last_seq: effectiveLastSeq,
  };
  return ok(response);
};
