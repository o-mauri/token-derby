import { chaseMarks, shortTokens, signedTokens } from './chase';
import type { LaneView } from '../models';

const lane = (id: string, position: number, tokens: number): LaneView => ({
  id, name: `Horse ${id}`, owner: 'o', colors: { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' },
  hat: null, tokens, level: 1, pace: null, position, league: null, stamina: null,
});

// Five horses, 1st to 5th.
const FIELD = [lane('a', 1, 500_000), lane('b', 2, 470_000), lane('c', 3, 430_000), lane('d', 4, 400_000), lane('e', 5, 300_000)];
const ids = (id: string, field = FIELD) => chaseMarks(field, id).map((m) => m.id);

describe('chaseMarks', () => {
  it('shows the leader the two horses behind it', () => {
    expect(ids('a')).toEqual(['c', 'b', 'a']);
  });

  it('shows 2nd the horse behind it and the leader', () => {
    expect(ids('b')).toEqual(['c', 'b', 'a']);
  });

  it('shows 3rd and below the horse directly ahead and the leader', () => {
    expect(ids('c')).toEqual(['c', 'b', 'a']);
    expect(ids('e')).toEqual(['e', 'd', 'a']);
  });

  it('orders marks from behind to ahead, whatever order the field arrives in', () => {
    expect(ids('e', [...FIELD].reverse())).toEqual(['e', 'd', 'a']);
  });

  it('gives each rival the hovered horse minus its tokens, and the hovered horse zero', () => {
    const marks = chaseMarks(FIELD, 'c');
    expect(marks.map((m) => [m.id, m.delta, m.you])).toEqual([['c', 0, true], ['b', -40_000, false], ['a', -70_000, false]]);
  });

  it('shows just the other horse in a two-horse race', () => {
    expect(ids('a', FIELD.slice(0, 2))).toEqual(['b', 'a']);
    expect(chaseMarks(FIELD.slice(0, 2), 'b').map((m) => m.at)).toEqual([10, 90]);
  });

  it('has nothing to chase alone, or for a horse not in the field', () => {
    expect(chaseMarks(FIELD.slice(0, 1), 'a')).toEqual([]);
    expect(chaseMarks(FIELD, 'zz')).toEqual([]);
  });

  it('pins the ends of the track and spaces the middle mark by its share of the gap', () => {
    // b is 40k of c's 70k gap to a: 10 + 80 × 4/7.
    const [low, mid, high] = chaseMarks(FIELD, 'c').map((m) => m.at);
    expect([low, high]).toEqual([10, 90]);
    expect(mid).toBeCloseTo(10 + (80 * 4) / 7);
  });

  it('keeps the middle mark a minimum distance from either end', () => {
    const runaway = [lane('a', 1, 2_000_000), lane('b', 2, 303_000), lane('c', 3, 300_000)];
    expect(chaseMarks(runaway, 'c').map((m) => m.at)).toEqual([10, 28, 90]);
    const pack = [lane('a', 1, 300_100), lane('b', 2, 300_000), lane('c', 3, 100_000)];
    expect(chaseMarks(pack, 'c').map((m) => m.at)).toEqual([10, 72, 90]);
  });

  it('centres the middle mark when all three are level', () => {
    const level = [lane('a', 1, 100), lane('b', 2, 100), lane('c', 3, 100)];
    expect(chaseMarks(level, 'c').map((m) => m.at)).toEqual([10, 50, 90]);
  });
});

describe('shortTokens', () => {
  it.each([
    [0, '0'], [950, '950'], [999.4, '999'], [999.6, '1.00k'], [9_512, '9.51k'], [37_655, '37.7k'],
    [139_580, '140k'], [999_600, '1.00M'], [1_236_400, '1.24M'], [2_500_000_000, '2.50B'],
  ])('%d → %s', (n, text) => {
    expect(shortTokens(n)).toBe(text);
  });

  it('ignores the sign', () => {
    expect(shortTokens(-37_655)).toBe('37.7k');
  });
});

describe('signedTokens', () => {
  it('marks a lead with + and a deficit with a minus sign', () => {
    expect(signedTokens(38_461)).toBe('+38.5k');
    expect(signedTokens(-1_236_400)).toBe('−1.24M');
    expect(signedTokens(0)).toBe('0');
  });
});
