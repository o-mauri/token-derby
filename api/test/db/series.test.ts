import { describe, it, expect } from 'vitest';
import { appendSeriesPoint, listSeriesPoints, listRecentSeriesPoints } from '../../src/db/series.js';

const rid = () => `r-${Math.random().toString(36).slice(2)}`;

describe('series db', () => {
  it('appends points and lists them in seq order', async () => {
    const race_id = rid();
    await appendSeriesPoint(race_id, 'h1', 1, { t: 1000, d: 50 });
    await appendSeriesPoint(race_id, 'h1', 2, { t: 2000, d: 70 });
    const points = await listSeriesPoints(race_id, 'h1');
    expect(points).toEqual([{ t: 1000, d: 50 }, { t: 2000, d: 70 }]);
  });

  it('is idempotent: a duplicate seq is a no-op', async () => {
    const race_id = rid();
    await appendSeriesPoint(race_id, 'h1', 1, { t: 1000, d: 50 });
    await appendSeriesPoint(race_id, 'h1', 1, { t: 9999, d: 999 }); // same seq
    const points = await listSeriesPoints(race_id, 'h1');
    expect(points).toEqual([{ t: 1000, d: 50 }]);
  });

  it('scopes points to one horse', async () => {
    const race_id = rid();
    await appendSeriesPoint(race_id, 'h1', 1, { t: 1, d: 1 });
    await appendSeriesPoint(race_id, 'h2', 1, { t: 2, d: 2 });
    expect(await listSeriesPoints(race_id, 'h1')).toEqual([{ t: 1, d: 1 }]);
  });

  describe('listRecentSeriesPoints', () => {
    it('returns the most recent points up to the limit', async () => {
      const race_id = rid();
      for (let seq = 1; seq <= 40; seq++) {
        await appendSeriesPoint(race_id, 'h1', seq, { t: seq * 60_000, d: seq });
      }
      const recent = await listRecentSeriesPoints(race_id, 'h1', 30);
      expect(recent).toHaveLength(30);
      // Only the newest 30 (seq 11..40); the oldest 10 are excluded.
      const ds = recent.map(p => p.d).sort((a, b) => a - b);
      expect(ds[0]).toBe(11);
      expect(ds[ds.length - 1]).toBe(40);
    });

    it('returns all points when fewer than the limit exist', async () => {
      const race_id = rid();
      await appendSeriesPoint(race_id, 'h1', 1, { t: 1000, d: 5 });
      await appendSeriesPoint(race_id, 'h1', 2, { t: 2000, d: 7 });
      const recent = await listRecentSeriesPoints(race_id, 'h1', 30);
      expect(recent.map(p => p.d).sort((a, b) => a - b)).toEqual([5, 7]);
    });

    it('scopes to one horse', async () => {
      const race_id = rid();
      await appendSeriesPoint(race_id, 'h1', 1, { t: 1, d: 1 });
      await appendSeriesPoint(race_id, 'h2', 1, { t: 2, d: 2 });
      expect(await listRecentSeriesPoints(race_id, 'h1', 30)).toEqual([{ t: 1, d: 1 }]);
    });
  });
});
