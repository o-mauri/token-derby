import { elapsedPct, laneProgress, leaderTokens } from './progress';

const start = '2026-04-22T09:00:00Z';
const end = '2026-04-22T17:00:00Z';

describe('elapsedPct', () => {
  it.each([
    ['2026-04-22T08:00:00Z', 0],
    ['2026-04-22T13:00:00Z', 0.5],
    ['2026-04-22T17:00:00Z', 1],
    ['2026-04-23T00:00:00Z', 1],
  ])('at %s is %f', (now, expected) => expect(elapsedPct(start, end, new Date(now))).toBe(expected));

  it('returns 0 when the race has no length', () => {
    expect(elapsedPct(end, start, new Date('2026-04-22T13:00:00Z'))).toBe(0);
  });
});

describe('leaderTokens', () => {
  it('returns the highest score', () => expect(leaderTokens([100, 500, 200])).toBe(500));
  it('never returns 0, so progress never divides by zero', () => {
    expect(leaderTokens([0, 0])).toBe(1);
    expect(leaderTokens([])).toBe(1);
  });
});

describe('laneProgress', () => {
  it('puts the leader at the elapsed share of the lane', () => expect(laneProgress(500, 500, 0.5)).toBe(50));
  it('scales everyone else by their share of the leader', () => expect(laneProgress(250, 500, 0.5)).toBe(25));
  it('keeps a lone horse with no score at the start', () => expect(laneProgress(0, leaderTokens([0]), 0.75)).toBe(0));
  it('puts tied leaders at the same point', () => expect(laneProgress(300, 300, 1)).toBe(laneProgress(300, 300, 1)));
  it('finishes the leader at 100', () => expect(laneProgress(900, 900, 1)).toBe(100));
});
