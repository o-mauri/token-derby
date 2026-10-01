import { describe, it, expect } from 'vitest';
import { priceRace, toPrice, SIMULATIONS, type MarketRunner } from '../src/markets.js';
import type { AttendanceDraws } from '../src/attendance/sampler.js';

const ONE = Float32Array.of(1);
const runner = (id: string, banked: number, pace: number, extra: Partial<MarketRunner> = {}): MarketRunner =>
  ({ horse_id: id, name: id, joined: true, seedKey: id, banked, pace, projection: ONE, ...extra });

// Everyone present for `minutes` in every replay, unless `absent` lists them.
function attendance(n: number, minutes: number, absent: number[] = []): AttendanceDraws {
  return {
    present: Array.from({ length: n }, (_, i) => new Uint8Array(SIMULATIONS).fill(absent.includes(i) ? 0 : 1)),
    active: Array.from({ length: n }, (_, i) => new Float32Array(SIMULATIONS).fill(absent.includes(i) ? 0 : minutes)),
  };
}

const price = (runners: MarketRunner[], att = attendance(runners.length, 240)) =>
  priceRace({ race_id: 'race-abc', runners, attendance: att });

describe('priceRace', () => {
  it('is deterministic for the same race', () => {
    const r = [runner('a', 1000, 50), runner('b', 900, 55), runner('c', 100, 20)];
    expect(price(r)).toEqual(price(r));
  });

  it("leaves a runner's prices driven by its own draws when another is added", () => {
    const solo = [runner('a', 1000, 50, { division: 1 }), runner('b', 1000, 50, { division: 1 })];
    const withC = [runner('c', 0, 80, { division: 2, joined: false }), ...solo];
    // c shares no division with a or b, so only shared randomness could move them.
    expect(price(withC).slice(1).map((p) => p.division)).toEqual(price(solo).map((p) => p.division));
  });

  it('sums win probabilities to 1 when everyone is present', () => {
    const p = price([runner('a', 1000, 50), runner('b', 900, 55), runner('c', 100, 20)]);
    expect(p.reduce((s, x) => s + x.win, 0)).toBeCloseTo(1, 6);
  });

  it('sums podium probabilities to the number of podium places', () => {
    const p = price([1, 2, 3, 4, 5].map((i) => runner(`h${i}`, i * 100, 40)));
    expect(p.reduce((s, x) => s + x.podium, 0)).toBeCloseTo(3, 6);
  });

  it('never counts an absent runner as a rival', () => {
    const r = [runner('a', 100, 10), runner('ghost', 1e9, 1000, { joined: false })];
    const p = price(r, attendance(2, 240, [1]));
    expect(p[0]!.win).toBe(1);
    expect(p[1]!.win).toBe(0);
    expect(p[1]!.podium).toBe(0);
    expect(p[1]!.joined).toBe(false);
  });

  it('adds nothing for a runner with no active minutes', () => {
    const r = [runner('a', 500, 1000), runner('b', 400, 0)];
    const att = attendance(2, 240);
    att.active[0]!.fill(0);
    expect(price(r, att)[0]!.win).toBe(1);
  });

  it('scales projected output by the projection table', () => {
    const r = [runner('a', 0, 100), runner('b', 0, 100, { projection: Float32Array.of(0.01) })];
    const p = price(r);
    expect(p[0]!.win).toBeGreaterThan(0.95);
  });

  it('sums division probabilities to 1 within each division', () => {
    const r = [
      runner('a', 500, 30, { division: 1 }), runner('b', 400, 30, { division: 1 }),
      runner('c', 300, 30, { division: 2 }), runner('d', 200, 30, { division: 2 }),
    ];
    const p = price(r);
    expect(p[0]!.division! + p[1]!.division!).toBeCloseTo(1, 6);
    expect(p[2]!.division! + p[3]!.division!).toBeCloseTo(1, 6);
  });

  it('counts a present not-joined runner as a division rival', () => {
    const r = [runner('a', 0, 30, { division: 1 }), runner('nj', 0, 300, { division: 1, joined: false })];
    expect(price(r)[0]!.division!).toBeLessThan(0.2);
  });

  it('leaves division markets null without a division', () => {
    const p = price([runner('a', 10, 1), runner('b', 5, 1)]);
    expect(p[0]!.division).toBeNull();
    expect(p[0]!.divisionPodium).toBeNull();
  });

  it('makes everyone a certainty for divisionPodium in a division of 3 or fewer', () => {
    const p = price([1, 2, 3].map((i) => runner(`h${i}`, i, 1, { division: 1 })));
    expect(p.every((x) => x.divisionPodium === 1)).toBe(true);
  });

  it('prices an uncatchable leader at the bounds', () => {
    const p = price([runner('a', 1_000_000, 10), runner('b', 1000, 10)]);
    expect(p[0]!.win).toBe(1);
    expect(p[1]!.win).toBe(0);
  });

  it('returns nothing for an empty field', () => {
    expect(priceRace({ race_id: 'x', runners: [], attendance: { present: [], active: [] } })).toEqual([]);
  });
});

describe('toPrice', () => {
  it('adds the margin', () => { expect(toPrice(0.5)).toBeCloseTo(0.51, 10); });
  it('caps at 1.00', () => { expect(toPrice(0.995)).toBe(1); });
  it('floors at 0.01', () => { expect(toPrice(0)).toBe(0.01); });
});
