import { describe, it, expect } from 'vitest';
import { handler as prune } from '../../src/handlers/prune-series.js';
import { appendSeriesPoint, listSeriesPoints } from '../../src/db/series.js';

const rid = () => `r-${Math.random().toString(36).slice(2)}`;
const runPrune = () => (prune as unknown as () => Promise<void>)();
const DAY = 24 * 60 * 60 * 1000;

describe('prune-series scheduled handler', () => {
  it('deletes series points older than two weeks and keeps recent ones', async () => {
    const race_id = rid();
    const now = Date.now();
    await appendSeriesPoint(race_id, 'h1', 1, { t: now - 20 * DAY, d: 5 }); // >2wk → deleted
    await appendSeriesPoint(race_id, 'h1', 2, { t: now - 15 * DAY, d: 6 }); // >2wk → deleted
    await appendSeriesPoint(race_id, 'h1', 3, { t: now - 3 * DAY, d: 9 });  // recent → kept

    await runPrune();

    expect(await listSeriesPoints(race_id, 'h1')).toEqual([{ t: now - 3 * DAY, d: 9 }]);
  });
});
