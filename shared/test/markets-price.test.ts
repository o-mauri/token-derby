import { describe, it, expect } from 'vitest';
import { priceRace, toPrice, type MarketRunner } from '../src/markets.js';

const runner = (id: string, banked: number, pace: number, division?: number): MarketRunner =>
  ({ horse_id: id, name: id, banked, pace, division });

const base = {
  race_id: 'race-abc',
  minutesRemaining: 240,
  phantoms: 0,
  phantomPacePool: [1200],
  maxRemainingPerRunner: 1e12,   // effectively unbounded unless a test says otherwise
};

describe('priceRace', () => {
  it('is deterministic for the same race', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55), runner('c', 100, 20)];
    const one = priceRace({ ...base, runners });
    const two = priceRace({ ...base, runners });
    expect(one).toEqual(two);
  });

  it('gives a different book to a different race', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55), runner('c', 100, 20)];
    const one = priceRace({ ...base, runners });
    const two = priceRace({ ...base, race_id: 'race-xyz', runners });
    expect(one).not.toEqual(two);
  });

  it('sums win probabilities to 1 when there are no phantoms', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55), runner('c', 100, 20)];
    const total = priceRace({ ...base, runners }).reduce((s, m) => s + m.win, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it('sums podium probabilities to the number of podium places', () => {
    const runners = ['a', 'b', 'c', 'd', 'e'].map((id, i) => runner(id, 1000 - i * 50, 40));
    const total = priceRace({ ...base, runners }).reduce((s, m) => s + m.podium, 0);
    expect(total).toBeCloseTo(3, 1);
  });

  it('makes everyone a certainty to podium in a two-horse race', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55)];
    for (const m of priceRace({ ...base, runners })) expect(m.podium).toBeCloseTo(1, 2);
  });

  it('sums division probabilities to 1 within each division', () => {
    const runners = [
      runner('a', 1000, 50, 1), runner('b', 900, 55, 1),
      runner('c', 800, 40, 2), runner('d', 700, 45, 2), runner('e', 600, 30, 2),
    ];
    const priced = priceRace({ ...base, runners });
    for (const div of [1, 2]) {
      const total = priced
        .filter((_, i) => runners[i]!.division === div)
        .reduce((s, m) => s + (m.division ?? 0), 0);
      expect(total).toBeCloseTo(1, 2);
    }
  });

  it('leaves the division market null for a horse with no division', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55)];
    for (const m of priceRace({ ...base, runners })) expect(m.division).toBeNull();
  });

  it('sums divisionPodium probabilities to min(3, division size) within each division', () => {
    const runners = [
      runner('a', 1000, 50, 1), runner('b', 900, 55, 1),
      runner('c', 800, 40, 2), runner('d', 700, 45, 2), runner('e', 600, 30, 2),
      runner('f', 500, 35, 2), runner('g', 400, 20, 2), runner('h', 300, 25, 2),
    ];
    const priced = priceRace({ ...base, runners });
    const bySize: Record<number, number> = { 1: 2, 2: 6 };
    for (const div of [1, 2]) {
      const total = priced
        .filter((_, i) => runners[i]!.division === div)
        .reduce((s, m) => s + (m.divisionPodium ?? 0), 0);
      expect(total).toBeCloseTo(Math.min(3, bySize[div]!), 1);
    }
  });

  it('makes everyone a certainty for divisionPodium in a division of 3 or fewer', () => {
    const runners = [
      runner('a', 1000, 50, 1), runner('b', 900, 55, 1), runner('c', 800, 40, 1),
      runner('d', 700, 45, 2), runner('e', 600, 30, 2), runner('f', 500, 35, 2),
      runner('g', 400, 20, 2), runner('h', 300, 25, 2),
    ];
    const priced = priceRace({ ...base, runners });
    for (const m of priced.filter((_, i) => runners[i]!.division === 1)) {
      expect(m.divisionPodium).toBeCloseTo(1, 2);
    }
  });

  it('leaves divisionPodium null for a horse with no division', () => {
    const runners = [runner('a', 1000, 50), runner('b', 900, 55)];
    for (const m of priceRace({ ...base, runners })) expect(m.divisionPodium).toBeNull();
  });

  it('prices divisionPodium at least as generously as the overall podium', () => {
    // Regression: aliasing divisionPodium to the race-wide podium understates
    // every division (top-3-of-5 beats top-3-of-15). The strict check below
    // on one mid-pack runner makes an exact-alias bug fail this test.
    const field = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o']
      .map((id, i) => runner(id, 1000 - i * 20, 45, i < 5 ? 1 : i < 10 ? 2 : 3));
    const priced = priceRace({ ...base, runners: field });
    for (const m of priced) {
      expect(m.divisionPodium!).toBeGreaterThanOrEqual(m.podium);
    }
    // Index 7: 3rd-best in its 5-horse division, but only 8th of 15 overall —
    // an easy top-3-of-5 versus a hard top-3-of-15.
    expect(priced[7]!.divisionPodium!).toBeGreaterThan(priced[7]!.podium);
  });

  it('phantoms push podium probability down, not just win', () => {
    // Regression: collapsing phantoms to their single best value caps their
    // contribution at one rival, which silently inflates every podium price.
    const field = ['a', 'b', 'c', 'd'].map((id, i) => runner(id, 1000 - i * 40, 45));
    const few = priceRace({ ...base, runners: field, phantoms: 1, phantomPacePool: [1400] });
    const many = priceRace({ ...base, runners: field, phantoms: 8, phantomPacePool: [1400] });
    for (let i = 0; i < field.length; i++) {
      expect(many[i]!.podium).toBeLessThan(few[i]!.podium);
    }
  });

  it('phantoms dilute a lone runner well below certainty', () => {
    // Pace kept close to the phantom pool on purpose: a horse 24x slower than
    // its rivals would be swamped to a ~0 win chance regardless of phantom
    // count, which tests total dilution rather than the partial dilution here.
    const alone = [runner('a', 1000, 1300)];
    const solo = priceRace({ ...base, runners: alone, phantoms: 0 })[0]!;
    const diluted = priceRace({
      ...base, runners: alone, phantoms: 7, phantomPacePool: [1200, 1500, 900],
    })[0]!;
    expect(solo.win).toBeCloseTo(1, 2);
    expect(diluted.win).toBeLessThan(0.6);
    expect(diluted.win).toBeGreaterThan(0);
  });

  it('prices a decided race at the bounds', () => {
    // The leader's lead exceeds everything the field could still produce.
    const runners = [runner('a', 1_000_000, 10), runner('b', 1000, 10)];
    const priced = priceRace({ ...base, runners, maxRemainingPerRunner: 5000 });
    expect(priced[0]!.win).toBe(1);
    expect(priced[1]!.win).toBe(0);
  });

  it('keeps the podium open in a decided race', () => {
    // The leader cannot be caught, but second and third are still contested.
    const runners = [
      runner('a', 1_000_000, 10), runner('b', 1000, 30), runner('c', 900, 30),
      runner('d', 800, 30), runner('e', 700, 30),
    ];
    const priced = priceRace({ ...base, runners, maxRemainingPerRunner: 5000 });
    expect(priced[0]!.win).toBe(1);
    expect(priced.slice(1).every((m) => m.win === 0)).toBe(true);
    expect(priced.reduce((s, m) => s + m.podium, 0)).toBeCloseTo(3, 1);
    // b..e are fighting for two places, so none of them is pinned at either bound.
    for (const m of priced.slice(1)) {
      expect(m.podium).toBeGreaterThan(0);
      expect(m.podium).toBeLessThan(1);
    }
  });

  it('gives a horse projected to produce nothing a nonzero chance while others can still fail', () => {
    const runners = [runner('a', 500, 0), runner('b', 100, 30)];
    const priced = priceRace({ ...base, runners });
    expect(priced[0]!.win).toBeGreaterThan(0);
    expect(priced[0]!.win).toBeLessThan(1);
  });
});

describe('toPrice', () => {
  it('adds the margin', () => {
    expect(toPrice(0.34)).toBeCloseTo(0.35, 6);
  });
  it('caps at 1.00 so a certainty costs exactly what it pays', () => {
    expect(toPrice(0.995)).toBe(1);
    expect(toPrice(1)).toBe(1);
  });
  it('floors at 0.01 so a free share never pays a Derbuck', () => {
    expect(toPrice(0)).toBe(0.01);
    expect(toPrice(-1)).toBe(0.01);
  });
  it('makes buying both sides cost more than the payout', () => {
    for (const p of [0.1, 0.34, 0.5, 0.8]) {
      expect(toPrice(p) + toPrice(1 - p)).toBeGreaterThan(1);
    }
  });
});
