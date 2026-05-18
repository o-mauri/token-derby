import { describe, it, expect } from 'vitest';
import {
  putHorse, listHorses, updateHorseTokens, setHorseFinalTokens,
  getHorseForHeartbeat, findHorseByUser, rotateHeartbeatToken,
} from '../../src/db/horses.js';
import type { Horse } from '@token-derby/shared';

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
    await updateHorseTokens(race_id, h.horse_id, 500, now);
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
