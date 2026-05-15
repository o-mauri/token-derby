import { describe, it, expect } from 'vitest';
import { putRace, getRaceById, setRaceEndedIfAbsent } from '../../src/db/races.js';
import { putHorse, listHorses } from '../../src/db/horses.js';
import { finaliseRace } from '../../src/lib/finalise-race.js';
import type { Horse, Race } from '@token-derby/shared';

function findHorse(horses: Horse[], name: string): Horse {
  const h = horses.find(h => h.name === name);
  if (!h) throw new Error(`horse ${name} not found`);
  return h;
}

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    race_id: `r-${Math.random().toString(36).slice(2)}`,
    name: 'Finalise Test',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'Europe/London',
    max_participants: 30,
    join_code: `J${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeHorse(name: string, current_tokens: number, overrides: Partial<Horse> = {}): Horse {
  return {
    horse_id: `h-${Math.random().toString(36).slice(2)}`,
    stable_horse_id: `s-${Math.random().toString(36).slice(2)}`,
    name,
    colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
    current_tokens,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    user_id: `u-${Math.random().toString(36).slice(2)}`,
    user_name: `User ${name}`,
    ...overrides,
  };
}

async function setupRace(horses: Horse[]): Promise<Race> {
  const race = makeRace();
  await putRace(race, `admin-${race.race_id}`);
  for (const h of horses) {
    await putHorse(race.race_id, h, `tok-${h.horse_id}`);
  }
  return race;
}

describe('finaliseRace', () => {
  it('stamps final_tokens and ended_at on first call', async () => {
    const horses = [makeHorse('Alpha', 100), makeHorse('Beta', 250)];
    const race = await setupRace(horses);

    const now = new Date();
    const result = await finaliseRace(race, now);

    expect(result.newly_finalised).toBe(true);
    expect(result.race.ended_at).toBe(now.toISOString());

    const fetched = await getRaceById(race.race_id);
    expect(fetched?.ended_at).toBe(now.toISOString());

    const stored = await listHorses(race.race_id);
    expect(findHorse(stored, 'Alpha').final_tokens).toBe(100);
    expect(findHorse(stored, 'Beta').final_tokens).toBe(250);
  });

  it('is a no-op when called on an already-finalised race', async () => {
    const horses = [makeHorse('Alpha', 100)];
    const race = await setupRace(horses);

    const first = await finaliseRace(race, new Date('2026-04-22T17:00:00Z'));
    const firstEnded = first.race.ended_at;

    // Pass the original (pre-finalise) race object — finaliseRace should
    // re-read state and bail without overwriting ended_at.
    const second = await finaliseRace({ ...race, ended_at: firstEnded }, new Date('2026-04-22T18:00:00Z'));
    expect(second.newly_finalised).toBe(false);
    expect(second.race.ended_at).toBe(firstEnded);

    const fetched = await getRaceById(race.race_id);
    expect(fetched?.ended_at).toBe(firstEnded);
  });

  it('two concurrent callers: exactly one persists ended_at, both see the same final state', async () => {
    const horses = [makeHorse('Alpha', 100), makeHorse('Beta', 250), makeHorse('Gamma', 175)];
    const race = await setupRace(horses);

    const tA = new Date('2026-04-22T17:00:00.000Z');
    const tB = new Date('2026-04-22T17:00:00.500Z');
    const [resA, resB] = await Promise.all([
      finaliseRace(race, tA),
      finaliseRace(race, tB),
    ]);

    // Exactly one of the two callers won the election.
    const winners = [resA, resB].filter(r => r.newly_finalised);
    expect(winners).toHaveLength(1);

    // Both return the same persisted ended_at value.
    expect(resA.race.ended_at).toBe(resB.race.ended_at);
    const persisted = await getRaceById(race.race_id);
    expect(persisted?.ended_at).toBe(resA.race.ended_at);

    // final_tokens stamped exactly once per horse.
    const stored = await listHorses(race.race_id);
    expect(findHorse(stored, 'Alpha').final_tokens).toBe(100);
    expect(findHorse(stored, 'Beta').final_tokens).toBe(250);
    expect(findHorse(stored, 'Gamma').final_tokens).toBe(175);
  });

  it('retries missing final_tokens stamps when prior finalisation crashed mid-stamp', async () => {
    const horses = [makeHorse('Alpha', 100), makeHorse('Beta', 250)];
    const race = await setupRace(horses);

    // Simulate a partial prior finalisation: Alpha got stamped, Beta did not,
    // and ended_at was never written.
    const alpha = findHorse(horses, 'Alpha');
    const { setHorseFinalTokens } = await import('../../src/db/horses.js');
    await setHorseFinalTokens(race.race_id, alpha.horse_id, 100);

    const now = new Date();
    const result = await finaliseRace(race, now);

    expect(result.newly_finalised).toBe(true);
    const stored = await listHorses(race.race_id);
    expect(findHorse(stored, 'Alpha').final_tokens).toBe(100);
    expect(findHorse(stored, 'Beta').final_tokens).toBe(250);
  });
});

describe('setRaceEndedIfAbsent', () => {
  it('persists the timestamp on first call', async () => {
    const race = makeRace();
    await putRace(race, `admin-${race.race_id}`);
    const now = new Date().toISOString();
    const result = await setRaceEndedIfAbsent(race.race_id, now);
    expect(result).toBe(now);
    expect((await getRaceById(race.race_id))?.ended_at).toBe(now);
  });

  it('returns the winning timestamp when a second caller races', async () => {
    const race = makeRace();
    await putRace(race, `admin-${race.race_id}`);
    const first = '2026-04-22T17:00:00.000Z';
    const second = '2026-04-22T17:00:00.500Z';
    const r1 = await setRaceEndedIfAbsent(race.race_id, first);
    const r2 = await setRaceEndedIfAbsent(race.race_id, second);
    expect(r1).toBe(first);
    expect(r2).toBe(first);
    expect((await getRaceById(race.race_id))?.ended_at).toBe(first);
  });
});
