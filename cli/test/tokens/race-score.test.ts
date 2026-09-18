import { describe, it, expect } from 'vitest';
import { RaceScoreTracker, type RaceScoreState } from '../../src/tokens/race-score.js';
import { SILENT_THRESHOLD } from '../../src/config.js';
import type { AllSources } from '../../src/tokens/race-tokens.js';

function baseState(convAcked: Partial<RaceScoreState['convAcked']> = {}): RaceScoreState {
  return {
    convAcked: { claude: {}, codex: {}, gemini: {}, ...convAcked },
    counted: { claude: 0, codex: 0, gemini: 0 },
    seq: 0,
  };
}

/** A reading built from per-model conversation maps; omitted models read empty. */
function reading(by: Partial<Record<keyof AllSources['byConv'], Record<string, number>>>): AllSources {
  return {
    byConv: {
      claude: new Map(Object.entries(by.claude ?? {})),
      codex: new Map(Object.entries(by.codex ?? {})),
      gemini: new Map(Object.entries(by.gemini ?? {})),
    },
  };
}

describe('RaceScoreTracker — every model counts the same', () => {
  it('emits a delta per model from its own conversations', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 100 }, codex: { r1: 40 }, gemini: { g: 7 } }));
    const beat = t.nextBeat();
    expect(beat.components).toEqual({ claude: 100, codex: 40, gemini: 7 });
  });

  it('sums every conversation within a model', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 10, b: 20, c: 30, d: 40, e: 50, f: 60 } }));
    expect(t.nextBeat().components.claude).toBe(210);
  });

  it('applies the per-conversation monotonic floor to every model, not just one', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ codex: { r1: 500 } }));
    t.recordReading(reading({ codex: { r1: 0 } }));   // a truncated read must not retract
    expect(t.nextBeat().components.codex).toBe(500);
  });

  it('excludes pre-join tokens for every model', () => {
    const t = new RaceScoreTracker(baseState({ claude: { a: 1000 }, gemini: { g: 20 } }));
    t.recordReading(reading({ claude: { a: 1050 }, gemini: { g: 25 } }));
    const beat = t.nextBeat();
    expect(beat.components.claude).toBe(50);
    expect(beat.components.gemini).toBe(5);
  });
});

describe('RaceScoreTracker — acking', () => {
  it('accumulates counted per model across acked beats', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 100 }, codex: { r: 10 } }));
    t.ack(t.nextBeat(), 1);
    t.recordReading(reading({ claude: { a: 250 }, codex: { r: 10 } }));
    t.ack(t.nextBeat(), 2);
    expect(t.countedPerModel()).toEqual({ claude: 250, codex: 10, gemini: 0 });
    expect(t.countedTotal()).toBe(260);
  });

  it('an acked beat is not counted twice', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 100 } }));
    t.ack(t.nextBeat(), 1);
    expect(t.nextBeat().components.claude).toBe(0);
  });

  it('reprime pins anchors for every model so the next deltas are 0', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 300 }, codex: { r: 50 }, gemini: { g: 9 } }));
    t.reprime();
    expect(t.nextBeat().components).toEqual({ claude: 0, codex: 0, gemini: 0 });
  });

  it('toState round-trips anchors, counts and seq', () => {
    const t = new RaceScoreTracker(baseState());
    t.recordReading(reading({ claude: { a: 100 }, codex: { r: 5 } }));
    t.ack(t.nextBeat(), 3);
    const s = t.toState();
    expect(s.convAcked.claude).toEqual({ a: 100 });
    expect(s.convAcked.codex).toEqual({ r: 5 });
    expect(s.counted).toEqual({ claude: 100, codex: 5, gemini: 0 });
    expect(s.seq).toBe(3);
  });
});

describe('RaceScoreTracker — stalls', () => {
  it('a null reading is a stall and does not move anchors', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < 5; i++) t.recordReading(null);
    expect(t.stalled).toBe(true);
    t.recordReading(reading({ claude: { a: 10 } }));
    expect(t.stalled).toBe(false);
  });

  it('surfaces the reason of a stall reading, and clears it on recovery', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < 5; i++) t.recordReading({ stall: "Can't read gemini token usage (EACCES)" });
    expect(t.stalled).toBe(true);
    expect(t.stallReason).toContain('gemini');
    t.recordReading(reading({ claude: { a: 10 } }));
    expect(t.stalled).toBe(false);
    expect(t.stallReason).toBeNull();
  });
});

describe('RaceScoreTracker — source silence', () => {
  it('is not silent before the threshold is reached', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD - 1; i++) t.recordReading(reading({}));
    expect(t.sourcesSilent).toBe(false);
  });

  it('reports silence once no source yields a conversation for the whole threshold', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD; i++) t.recordReading(reading({}));
    expect(t.sourcesSilent).toBe(true);
  });

  it('one live source is enough to stay quiet — you only need one tool installed', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD * 2; i++) t.recordReading(reading({ gemini: { g: 5 } }));
    expect(t.sourcesSilent).toBe(false);
  });

  it('does not flag an idle player, whose conversations exist but are not growing', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD * 2; i++) t.recordReading(reading({ claude: { a: 100 } }));
    expect(t.sourcesSilent).toBe(false);
    expect(t.nextBeat().components.claude).toBe(100);
  });

  it('clears the silence as soon as a conversation reappears', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD; i++) t.recordReading(reading({}));
    t.recordReading(reading({ codex: { r: 5 } }));
    expect(t.sourcesSilent).toBe(false);
  });

  it('does not count a stalled beat as silence — a stall reports its own cause', () => {
    const t = new RaceScoreTracker(baseState());
    for (let i = 0; i < SILENT_THRESHOLD * 2; i++) t.recordReading({ stall: 'timed out' });
    expect(t.sourcesSilent).toBe(false);
  });
});
