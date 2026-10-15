import { startsIn } from './starts-in';

describe('startsIn', () => {
  it.each([
    [38 * 3600 + 120, 'in 1d 14h'], [110 * 3600, 'in 4d 14h'], [3 * 3600 + 25 * 60, 'in 3h 25m'],
    [25 * 60, 'in 25m'], [30, 'in under a minute'], [0, 'starting'], [-5, 'starting'], [2 * 86400, 'in 2d'],
  ])('describes %d seconds as %s', (s, out) => expect(startsIn(s)).toBe(out));
});
