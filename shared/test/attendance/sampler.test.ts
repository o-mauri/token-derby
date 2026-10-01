import { describe, it, expect } from 'vitest';
import {
  prepareHabit, joinRestProbability, drawDeparture, sampleAttendance, type SamplerPlayer,
} from '../../src/attendance/sampler.js';
import { fitDensity } from '../../src/attendance/kde.js';
import { GRID } from '../../src/attendance/clock.js';

const office = prepareHabit({
  login_propensity: 0.8,
  density: fitDensity([
    { arrival: 540, departure: 1020 }, { arrival: 555, departure: 1005 }, { arrival: 570, departure: 1035 },
    { arrival: 530, departure: 990 }, { arrival: 600, departure: 1050 },
  ])!,
});
const morning = prepareHabit({
  login_propensity: 0.9,
  density: fitDensity([{ arrival: 480, departure: 600 }, { arrival: 490, departure: 610 }, { arrival: 470, departure: 590 }])!,
});
const afternoon = prepareHabit({
  login_propensity: 0.7,
  density: fitDensity([{ arrival: 780, departure: 1050 }, { arrival: 800, departure: 1070 }, { arrival: 760, departure: 1030 }])!,
});

const base = { race_id: 'race-1', replays: 10_000, now: 720, finish: 1050, fallback: null };

describe('prepareHabit', () => {
  it('builds cumulative tables that end at 1', () => {
    expect(office.arrivalCdf[GRID]!).toBeCloseTo(1, 5);
    let cols = 0;
    for (let x = 0; x < GRID; x++) cols += office.colCdf[x * (GRID + 1) + GRID]!;
    expect(cols).toBeCloseTo(1, 5);
  });
});

describe('drawDeparture', () => {
  it('never departs before notBefore', () => {
    for (let i = 0; i < 1000; i++) {
      const d = drawDeparture(office, 540, 900, i / 1000);
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThanOrEqual(900);
    }
  });
  it('returns null when the history has nothing that late', () => {
    expect(drawDeparture(morning, 480, 1200, 0.5)).toBeNull();
  });
});

describe('joinRestProbability', () => {
  it('is near zero for a morning player after lunch', () => {
    expect(joinRestProbability(morning, 720, 1050)).toBeLessThan(0.02);
  });
  it('stays close to P(login) for an afternoon player still to come', () => {
    // Not having arrived yet is expected, so the survival update barely lowers it.
    expect(joinRestProbability(afternoon, 720, 1050)).toBeGreaterThan(0.6);
  });
});

describe('sampleAttendance', () => {
  it('turns offline players up at the rate joinRestProbability predicts', () => {
    const draws = sampleAttendance({ ...base, players: [{ key: 'u-a', kind: 'offline', habit: afternoon }] });
    const rate = draws.present[0]!.reduce((s, v) => s + v, 0) / base.replays;
    expect(rate).toBeCloseTo(joinRestProbability(afternoon, 720, 1050), 1);
  });

  it('keeps offline arrivals inside the rest of the race', () => {
    const draws = sampleAttendance({ ...base, players: [{ key: 'u-a', kind: 'offline', habit: afternoon }] });
    for (let r = 0; r < base.replays; r++) {
      if (!draws.present[0]![r]) { expect(draws.active[0]![r]).toBe(0); continue; }
      expect(draws.active[0]![r]!).toBeLessThanOrEqual(base.finish - base.now + 1e-6);
    }
  });

  it('always includes a joined player', () => {
    const draws = sampleAttendance({
      ...base,
      players: [{ key: 'u-j', kind: 'joined', arrival: 545, lastScore: 715, habit: office }],
    });
    expect(draws.present[0]!.every((v) => v === 1)).toBe(true);
  });

  it('lets a joined player with no habits and no fallback stay to the finish', () => {
    const draws = sampleAttendance({
      ...base,
      players: [{ key: 'u-j', kind: 'joined', arrival: 545, lastScore: 715, habit: null }],
    });
    expect(draws.active[0]!.every((v) => v === base.finish - base.now)).toBe(true);
  });

  it('falls back to the org column when a joined player has outstayed their history', () => {
    const draws = sampleAttendance({
      ...base, fallback: office,
      players: [{ key: 'u-j', kind: 'joined', arrival: 480, lastScore: 800, habit: morning }],
    });
    const mean = draws.active[0]!.reduce((s, v) => s + v, 0) / base.replays;
    expect(mean).toBeGreaterThan(60);
    expect(mean).toBeLessThan(base.finish - base.now);
  });

  it('is deterministic for the same race', () => {
    const players: SamplerPlayer[] = [
      { key: 'u-a', kind: 'offline', habit: afternoon },
      { key: 'u-j', kind: 'joined', arrival: 545, lastScore: 715, habit: office },
    ];
    expect(sampleAttendance({ ...base, players })).toEqual(sampleAttendance({ ...base, players }));
  });

  it("leaves every other player's draws unchanged when one is added", () => {
    const a: SamplerPlayer = { key: 'u-a', kind: 'offline', habit: afternoon };
    const j: SamplerPlayer = { key: 'u-j', kind: 'joined', arrival: 545, lastScore: 715, habit: office };
    const before = sampleAttendance({ ...base, players: [a, j] });
    const after = sampleAttendance({ ...base, players: [{ key: 'u-new', kind: 'offline', habit: morning }, a, j] });
    expect(after.present[1]).toEqual(before.present[0]);
    expect(after.active[1]).toEqual(before.active[0]);
    expect(after.active[2]).toEqual(before.active[1]);
  });

  it('samples 50 players x 10,000 replays in under 150 ms', () => {
    const players: SamplerPlayer[] = Array.from({ length: 50 }, (_, i) =>
      i % 2
        ? { key: `u-${i}`, kind: 'offline', habit: i % 4 === 1 ? afternoon : morning }
        : { key: `u-${i}`, kind: 'joined', arrival: 540, lastScore: 700, habit: office });
    sampleAttendance({ ...base, players });   // warm the JIT
    const t0 = performance.now();
    sampleAttendance({ ...base, players });
    expect(performance.now() - t0).toBeLessThan(150);
  });
});
