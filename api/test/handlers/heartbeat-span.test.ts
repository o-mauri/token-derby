import { describe, it, expect } from 'vitest';
import { applyHeartbeatDelta, listHorses } from '../../src/db/horses.js';
import { seedLiveRace } from '../helpers/races.js';
import { zeroPerFamily } from '@token-derby/shared';

const state = {
  live_xp: 0, racer_streak_ms: 0, racer_awards: 0, pacesetter_streak_ms: 0, pacesetter_awards: 0,
  overtake_awards: 0, lead_take_awards: 0, was_in_last: false, comeback_awarded: false, recent_events: [],
} as any;

async function beat(race_id: string, horse_id: string, seq: number, applied: number, at: string) {
  return applyHeartbeatDelta({
    race_id, horse_id, seq, applied, scored_applied: applied, modifier_states: {},
    last_heartbeat: at, state, components: { ...zeroPerFamily(), anthropic: applied },
    needsSeed: seq === 1, ...(applied > 0 ? { scored_at: at } : {}),
  });
}

describe('scoring span', () => {
  it('stamps first_scored_at once and moves last_scored_at on each scoring beat', async () => {
    const { race, horses } = await seedLiveRace({ runners: 1, elapsedMin: 30 });
    const id = horses[0]!.horse_id;
    await beat(race.race_id, id, 1, 100, '2026-10-01T09:00:00.000Z');
    await beat(race.race_id, id, 2, 50, '2026-10-01T09:05:00.000Z');
    const h = (await listHorses(race.race_id))[0]!;
    expect(h.first_scored_at).toBe('2026-10-01T09:00:00.000Z');
    expect(h.last_scored_at).toBe('2026-10-01T09:05:00.000Z');
  });

  it('leaves both untouched on a zero-delta beat', async () => {
    const { race, horses } = await seedLiveRace({ runners: 1, elapsedMin: 30 });
    const id = horses[0]!.horse_id;
    await beat(race.race_id, id, 1, 100, '2026-10-01T09:00:00.000Z');
    await beat(race.race_id, id, 2, 0, '2026-10-01T09:30:00.000Z');
    const h = (await listHorses(race.race_id))[0]!;
    expect(h.last_scored_at).toBe('2026-10-01T09:00:00.000Z');
  });

  it('never sets them for a horse that has not scored', async () => {
    const { race, horses } = await seedLiveRace({ runners: 1, elapsedMin: 30 });
    await beat(race.race_id, horses[0]!.horse_id, 1, 0, '2026-10-01T09:00:00.000Z');
    const h = (await listHorses(race.race_id))[0]!;
    expect(h.first_scored_at).toBeUndefined();
    expect(h.last_scored_at).toBeUndefined();
  });
});
