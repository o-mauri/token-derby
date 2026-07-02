import { describe, it, expect } from 'vitest';
import { RaceScoreTracker, type RaceScoreState } from '../../src/tokens/race-score.js';
import type { AllSources } from '../../src/tokens/race-tokens.js';

// Primary = claude in these tests. secondary holds codex/gemini scalars.
function baseState(primaryConv: Record<string, number> = {}): RaceScoreState {
  return {
    acked: { claude: 0, codex: 0, gemini: 0 },
    lastGood: { claude: 0, codex: 0, gemini: 0 },
    primaryConvAcked: { ...primaryConv },
    primaryCounted: 0,
    seq: 0,
  };
}
function reading(primaryByConv: Record<string, number>, codex = 0, gemini = 0): AllSources {
  return { secondary: { claude: 0, codex, gemini }, primaryByConv: new Map(Object.entries(primaryByConv)) };
}

describe('RaceScoreTracker — secondaries (scalar, unchanged)', () => {
  it('emits secondary components as scalar deltas above the anchor', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({}, 500, 0));
    t.recordReading(reading({}, 530, 0));
    expect(t.nextBeat().components.codex).toBe(530);
  });

  it('never lowers a secondary lastGood on a transient 0 read', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({}, 500, 0)); // codex = 500
    t.recordReading(reading({}, 0, 0));   // codex momentarily 0 → must keep 500
    expect(t.nextBeat().components.codex).toBe(500);
  });
});

describe('RaceScoreTracker — primary top-N + forfeit', () => {
  it('flag OFF: sums ALL conversation deltas (today behavior)', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 60 }));
    expect(t.nextBeat().components.claude).toBe(210); // all six summed
  });

  it('flag ON: sums only the top 5 conversation deltas', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', true);
    t.recordReading(reading({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 60 }));
    expect(t.nextBeat().components.claude).toBe(200); // top 5: 60+50+40+30+20, drops the 10
  });

  it('flag ON: fewer than 5 conversations → sums all', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', true);
    t.recordReading(reading({ a: 10, b: 20, c: 30 }));
    expect(t.nextBeat().components.claude).toBe(60);
  });

  it('flag ON: forfeits non-top-5 growth on ack (the 6th never counts later)', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', true);
    t.recordReading(reading({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 5 })); // f=5 is the 6th
    const b1 = t.nextBeat();
    expect(b1.components.claude).toBe(150); // 50+40+30+20+10, f forfeited
    t.ack(b1, 1);
    // next beat: only f grows further to 9 (delta 4 since its anchor was advanced to 5)
    t.recordReading(reading({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 9 }));
    const b2 = t.nextBeat();
    expect(b2.components.claude).toBe(4); // f's growth since forfeit anchor; a..e have no new growth
  });

  it('baseline excludes pre-join per-conversation tokens', () => {
    const t = new RaceScoreTracker(baseState({ a: 1000 }), 'claude', false); // a already had 1000 at join
    t.recordReading(reading({ a: 1050 }));
    expect(t.nextBeat().components.claude).toBe(50); // only post-join growth
  });

  it('default (disabled) counts every conversation — legacy races behavior', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 60 }));
    expect(t.nextBeat().components.claude).toBe(210);
  });

  it('accumulates primaryCounted across acked beats', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({ a: 100 }));
    const b1 = t.nextBeat(); t.ack(b1, 1);
    t.recordReading(reading({ a: 250 }));
    const b2 = t.nextBeat(); t.ack(b2, 2);
    expect(t.primaryCounted()).toBe(250); // 100 then +150
  });

  it('reprime pins primary conv anchors so the next delta is 0', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({ a: 300 }));
    t.reprime();
    expect(t.nextBeat().components.claude).toBe(0);
  });

  it('a null reading is a stall and does not move anchors', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    for (let i = 0; i < 5; i++) t.recordReading(null);
    expect(t.stalled).toBe(true);
    t.recordReading(reading({ a: 10 }));
    expect(t.stalled).toBe(false);
  });

  it('surfaces the reason of a stall reading, and clears it on recovery', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    for (let i = 0; i < 5; i++) t.recordReading({ stall: "Can't read gemini token usage (ENOENT)" });
    expect(t.stalled).toBe(true);
    expect(t.stallReason).toContain('gemini');
    t.recordReading(reading({ a: 10 })); // a good read recovers
    expect(t.stalled).toBe(false);
    expect(t.stallReason).toBeNull();
  });

  it('toState round-trips the new fields', () => {
    const t = new RaceScoreTracker(baseState(), 'claude', false);
    t.recordReading(reading({ a: 100 }, 5, 0));
    const b = t.nextBeat(); t.ack(b, 3);
    const s = t.toState();
    expect(s.primaryConvAcked).toEqual({ a: 100 });
    expect(s.primaryCounted).toBe(100);
    expect(s.seq).toBe(3);
  });
});
