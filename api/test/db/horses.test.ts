import { describe, it, expect } from 'vitest';
import { putHorse, listHorses, updateHorseTokens, setHorseFinalTokens, getHorseForHeartbeat } from '../../src/db/horses.js';
import type { Horse } from '@token-derby/shared';

function makeHorse(overrides: Partial<Horse> = {}): Horse {
  return {
    horse_id: `h-${Math.random().toString(36).slice(2)}`,
    name: 'Gallopin Gary',
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: 0,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date().toISOString(),
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
});
