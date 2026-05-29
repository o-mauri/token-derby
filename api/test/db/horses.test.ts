import { describe, it, expect } from 'vitest';
import {
  putHorse, listHorses, updateHorseHeartbeat, setHorseFinalTokens,
  getHorseForHeartbeat, findHorseByUser, rotateHeartbeatToken, applyHeartbeatDelta,
} from '../../src/db/horses.js';
import type { Horse } from '@token-derby/shared';
import type { AchievementState } from '../../src/lib/evaluate-achievements.js';

const emptyState: AchievementState = {
  live_xp: 0, last_rank: undefined,
  racer_streak_ms: 0, racer_awards: 0,
  pacesetter_streak_ms: 0, pacesetter_awards: 0,
  overtake_awards: 0, lead_take_awards: 0,
  last_stampede_at: undefined, was_in_last: false, comeback_awarded: false,
  last_gap_in_1st: undefined, last_pulled_away_at: undefined,
  recent_events: [],
};

function makeHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    horse_id: `h-${Math.random().toString(36).slice(2)}`,
    stable_horse_id: `sh-${Math.random().toString(36).slice(2)}`,
    name: 'Gallopin Gary',
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: 0,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    user_name: 'Test User',
    xp: 0,
    ...overrides,
  };
}

describe('horses db', () => {
  it('puts and lists horses for a race', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h1 = makeHorse();
    const h2 = makeHorse({ name: 'Prompt Pony' });
    await putHorse(race_id, h1, 'hb-token-1');
    await putHorse(race_id, h2, 'hb-token-2');
    const horses = await listHorses(race_id);
    const names = horses.map(h => h.name).sort();
    expect(names).toEqual(['Gallopin Gary', 'Prompt Pony']);
  });

  it('updates current_tokens and last_heartbeat', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse();
    await putHorse(race_id, h, 'tok');
    const now = new Date().toISOString();
    await updateHorseHeartbeat(race_id, h.horse_id, 500, now, emptyState);
    const [updated] = await listHorses(race_id);
    expect(updated?.current_tokens).toBe(500);
    expect(updated?.last_heartbeat).toBe(now);
  });

  it('sets final_tokens', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 1200 });
    await putHorse(race_id, h, 'tok');
    await setHorseFinalTokens(race_id, h.horse_id, 1200);
    const [updated] = await listHorses(race_id);
    expect(updated?.final_tokens).toBe(1200);
  });

  it('returns horse heartbeat state on valid token, null otherwise', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 250 });
    await putHorse(race_id, h, 'secret-hb');

    const got = await getHorseForHeartbeat(race_id, h.horse_id, 'secret-hb');
    expect(got).not.toBeNull();
    expect(got!.current_tokens).toBe(250);
    expect(got!.last_heartbeat).toBe(h.last_heartbeat);

    expect(await getHorseForHeartbeat(race_id, h.horse_id, 'wrong')).toBeNull();
    expect(await getHorseForHeartbeat(race_id, 'no-such-horse', 'secret-hb')).toBeNull();
  });

  it('finds a horse by user_id', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const userA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const userB = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const h1 = makeHorse({ name: 'Alpha', user_id: userA });
    const h2 = makeHorse({ name: 'Beta', user_id: userB });
    await putHorse(race_id, h1, 'tok1');
    await putHorse(race_id, h2, 'tok2');

    const found = await findHorseByUser(race_id, userA);
    expect(found?.horse_id).toBe(h1.horse_id);
    expect(found?.user_name).toBe('Test User');

    expect(await findHorseByUser(race_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff')).toBeNull();
  });

  it('clears last_gap_in_1st via DDB REMOVE when set to undefined', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse();
    await putHorse(race_id, h, 'hb-gap');
    const now = new Date().toISOString();

    // Step 1: write with last_gap_in_1st = 5000
    await updateHorseHeartbeat(race_id, h.horse_id, 100, now, {
      ...emptyState,
      last_gap_in_1st: 5000,
    });
    const got1 = await getHorseForHeartbeat(race_id, h.horse_id, 'hb-gap');
    expect(got1?.last_gap_in_1st).toBe(5000);

    // Step 2: write with last_gap_in_1st = undefined (horse drops from 1st)
    await updateHorseHeartbeat(race_id, h.horse_id, 100, now, {
      ...emptyState,
      last_gap_in_1st: undefined,
    });
    const got2 = await getHorseForHeartbeat(race_id, h.horse_id, 'hb-gap');
    // Must be undefined, not the stale 5000
    expect(got2?.last_gap_in_1st).toBeUndefined();
  });

  it('applies a delta atomically and advances last_seq', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 100 });
    await putHorse(race_id, h, 'tok');
    const now = new Date().toISOString();
    const applied = await applyHeartbeatDelta(race_id, h.horse_id, 1, 50, now, emptyState);
    expect(applied).toBe(true);
    const [u] = await listHorses(race_id);
    expect(u?.current_tokens).toBe(150);
    expect(u?.last_seq).toBe(1);
  });

  it('rejects a duplicate/old seq without re-applying', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 100 });
    await putHorse(race_id, h, 'tok');
    const now = new Date().toISOString();
    await applyHeartbeatDelta(race_id, h.horse_id, 2, 50, now, emptyState); // -> 150, last_seq 2
    const dup = await applyHeartbeatDelta(race_id, h.horse_id, 2, 50, now, emptyState);
    const older = await applyHeartbeatDelta(race_id, h.horse_id, 1, 50, now, emptyState);
    expect(dup).toBe(false);
    expect(older).toBe(false);
    const [u] = await listHorses(race_id);
    expect(u?.current_tokens).toBe(150); // unchanged
    expect(u?.last_seq).toBe(2);
  });

  it('getHorseForHeartbeat returns last_seq (0 when absent)', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse();
    await putHorse(race_id, h, 'tok');
    const rec = await getHorseForHeartbeat(race_id, h.horse_id, 'tok');
    expect(rec?.last_seq).toBe(0);
  });

  it('rotates heartbeat token while leaving other fields alone', async () => {
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const h = makeHorse({ current_tokens: 42 });
    await putHorse(race_id, h, 'old-tok');

    await rotateHeartbeatToken(race_id, h.horse_id, 'new-tok');

    expect(await getHorseForHeartbeat(race_id, h.horse_id, 'old-tok')).toBeNull();
    const got = await getHorseForHeartbeat(race_id, h.horse_id, 'new-tok');
    expect(got).not.toBeNull();
    expect(got!.current_tokens).toBe(42);
  });
});
