import { relativeTime } from './relative-time';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

describe('relativeTime', () => {
  it.each([
    [30_000, 'just now'],
    [5 * MIN, '5 min ago'],
    [3 * H, '3 h ago'],
    [26 * H, 'yesterday'],
    [4 * D, '4 days ago'],
    [20 * D, '2 weeks ago'],
  ])('%i ms ago reads "%s"', (ms, text) => {
    expect(relativeTime(ago(ms), NOW)).toBe(text);
  });

  it('falls back to a fixed-format date past nine weeks', () => {
    expect(relativeTime('2026-06-28T09:00:00Z', NOW)).toBe('28 Jun 2026');
    expect(relativeTime('2026-09-01T09:00:00Z', Date.parse('2026-12-31T00:00:00Z'))).toBe('1 Sep 2026');
  });
});
