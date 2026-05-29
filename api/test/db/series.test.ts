import { describe, it, expect } from 'vitest';
import { appendSeriesPoint, listSeriesPoints } from '../../src/db/series.js';

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
});
