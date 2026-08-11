import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  getSnapshot, putSnapshot, appendHistory, listHistory,
  HISTORY_RETENTION_MS,
} from '../../src/db/markets.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { RACE_PK_PREFIX } from '../../src/db/keys.js';
import type { MarketSnapshot } from '@token-derby/shared';

const snap = (race_id: string, bucket: number, win: number): MarketSnapshot => ({
  race_id, bucket,
  computed_at: new Date(bucket * 60_000).toISOString(),
  phantoms: 2,
  prices: [{ horse_id: 'h1', win, podium: 0.9, division: 0.5 }],
});

describe('market snapshots', () => {
  it('reads null before anything is written', async () => {
    expect(await getSnapshot(randomUUID())).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    const id = randomUUID();
    await putSnapshot(snap(id, 100, 0.42));
    const got = await getSnapshot(id);
    expect(got!.bucket).toBe(100);
    expect(got!.prices[0]!.win).toBeCloseTo(0.42, 6);
    expect(got!.phantoms).toBe(2);
  });

  it('overwrites rather than accumulating', async () => {
    const id = randomUUID();
    await putSnapshot(snap(id, 100, 0.42));
    await putSnapshot(snap(id, 101, 0.55));
    const got = await getSnapshot(id);
    expect(got!.bucket).toBe(101);
    expect(got!.prices[0]!.win).toBeCloseTo(0.55, 6);
  });

  it('keeps history in chronological order', async () => {
    const id = randomUUID();
    for (const b of [300, 100, 200]) await appendHistory(snap(id, b, b / 1000), HISTORY_RETENTION_MS);
    const hist = await listHistory(id);
    expect(hist.map((h) => h.bucket)).toEqual([100, 200, 300]);
  });

  it('keeps history in chronological order across bucket digit lengths', async () => {
    // Without zero-padding the sort key, bucket 100 (3 digits) would sort
    // after bucket 1000 (4 digits) as a plain string — this proves it doesn't.
    const id = randomUUID();
    for (const b of [1000, 5, 100, 20]) await appendHistory(snap(id, b, 0), HISTORY_RETENTION_MS);
    const hist = await listHistory(id);
    expect(hist.map((h) => h.bucket)).toEqual([5, 20, 100, 1000]);
  });

  it('stamps a ttl on history rows, in epoch SECONDS, ~14 days after computed_at', async () => {
    const id = randomUUID();
    const bucket = 100;
    await appendHistory(snap(id, bucket, 0.4), HISTORY_RETENTION_MS);

    const { Item } = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `${RACE_PK_PREFIX}${id}`, sk: `MARKETS#${String(bucket).padStart(12, '0')}` },
    }));

    expect(typeof Item?.ttl).toBe('number');
    // The computed-at instant this bucket represents, plus the retention
    // window, converted to SECONDS — a ms value would be ~1000x too large.
    const expectedTtl = Math.floor((bucket * 60_000 + HISTORY_RETENTION_MS) / 1000);
    expect(Item!.ttl).toBe(expectedTtl);
  });

  it('keeps history separate from the current snapshot', async () => {
    const id = randomUUID();
    await putSnapshot(snap(id, 100, 0.42));
    await appendHistory(snap(id, 100, 0.42), HISTORY_RETENTION_MS);
    expect(await getSnapshot(id)).not.toBeNull();
    expect(await listHistory(id)).toHaveLength(1);
  });

  it('does not leak one race\'s history into another', async () => {
    const a = randomUUID(), b = randomUUID();
    await appendHistory(snap(a, 100, 0.4), HISTORY_RETENTION_MS);
    await appendHistory(snap(b, 100, 0.9), HISTORY_RETENTION_MS);
    expect(await listHistory(a)).toHaveLength(1);
    expect((await listHistory(a))[0]!.prices[0]!.win).toBeCloseTo(0.4, 6);
  });
});
