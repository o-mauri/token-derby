import { describe, it, expect } from 'vitest';
import { RaceScoreTracker, type RaceScoreState } from '../../src/tokens/race-score.js';
import type { SourceReading } from '../../src/tokens/race-tokens.js';

const r = (claude: number, codex = 0, gemini = 0): SourceReading => ({ claude, codex, gemini });
function fresh(baseline: SourceReading): RaceScoreTracker {
  return new RaceScoreTracker({ acked: baseline, lastGood: baseline, seq: 0 });
}

describe('RaceScoreTracker (per-source)', () => {
  it('first beat after baseline has zero components', () => {
    const t = fresh(r(1000, 500, 0));
    expect(t.nextBeat().components).toEqual(r(0, 0, 0));
  });

  it('components are per-source deltas above the acked anchor', () => {
    const t = fresh(r(1000, 500, 0));
    t.recordReading(r(1050, 530, 0));
    expect(t.nextBeat().components).toEqual(r(50, 30, 0));
  });

  it('a null reading is a stall and does not move anchors', () => {
    const t = fresh(r(1000));
    t.recordReading(null);
    expect(t.nextBeat().components).toEqual(r(0, 0, 0));
  });

  it('never anchors a source DOWN to 0 (readable-but-empty per source)', () => {
    const t = fresh(r(1000, 500, 0));
    t.recordReading(r(1050, 0, 0)); // codex momentarily 0 → keep its lastGood
    expect(t.nextBeat().components).toEqual(r(50, 0, 0));
    expect(t.readings()).toEqual(r(1050, 500, 0));
  });

  it('ack advances each source acked to the snapshot readings; next delta is 0', () => {
    const t = fresh(r(1000, 500, 0));
    t.recordReading(r(1050, 530, 0));
    const b = t.nextBeat();
    t.ack(b, 1);
    expect(t.nextBeat().components).toEqual(r(0, 0, 0));
  });

  it('stalls after STALL_THRESHOLD consecutive null reads', () => {
    const t = fresh(r(1000));
    for (let i = 0; i < 5; i++) t.recordReading(null);
    expect(t.stalled).toBe(true);
    t.recordReading(r(1010));
    expect(t.stalled).toBe(false);
  });

  it('reprime pins acked to lastGood (pending races)', () => {
    const t = fresh(r(1000, 500, 0));
    t.recordReading(r(1300, 700, 0));
    t.reprime();
    expect(t.nextBeat().components).toEqual(r(0, 0, 0));
  });

  it('toState round-trips per-source anchors and seq', () => {
    const t = fresh(r(100, 50, 0));
    t.recordReading(r(300, 90, 0));
    const b = t.nextBeat();
    t.ack(b, 4);
    expect(t.toState()).toEqual({ acked: r(300, 90, 0), lastGood: r(300, 90, 0), seq: 4 });
  });
});
