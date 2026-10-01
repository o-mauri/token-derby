import { describe, it, expect } from 'vitest';
import { resolveHeartbeatDelta, capBeat, MAX_RAW_TOKENS_PER_BEAT } from '../../src/lib/heartbeat-delta.js';

describe('resolveHeartbeatDelta', () => {
  it('sums every family at equal weight', () => {
    const r = resolveHeartbeatDelta({ components: { anthropic: 1000, openai: 500, google: 200 } });
    expect(r).toEqual({ total: 1700, components: { anthropic: 1000, openai: 500, google: 200 } });
  });

  it('a single-family beat passes straight through', () => {
    expect(resolveHeartbeatDelta({ components: { anthropic: 300, openai: 0, google: 0 } })?.total).toBe(300);
  });

  it('accepts the keys an un-upgraded CLI sends', () => {
    // Pre-split CLIs named the tool, not the vendor. They must still score.
    const r = resolveHeartbeatDelta({ components: { claude: 1000, codex: 500, gemini: 200 } });
    expect(r).toEqual({ total: 1700, components: { anthropic: 1000, openai: 500, google: 200 } });
  });

  it('merges legacy and current keys naming the same family', () => {
    const r = resolveHeartbeatDelta({ components: { claude: 100, anthropic: 50 } });
    expect(r?.components.anthropic).toBe(150);
    expect(r?.total).toBe(150);
  });

  it('ignores a key naming no family we score, rather than guessing', () => {
    const r = resolveHeartbeatDelta({ components: { anthropic: 100, deepseek: 9_999 } });
    expect(r).toEqual({ total: 100, components: { anthropic: 100, openai: 0, google: 0 } });
  });

  it('prefers components over a legacy delta when both present', () => {
    expect(resolveHeartbeatDelta({ delta: 9999, components: { anthropic: 100 } })?.total).toBe(100);
  });

  it('treats negative or non-finite component values as 0', () => {
    const r = resolveHeartbeatDelta({ components: { anthropic: -5, openai: Infinity as any, google: 10 } });
    expect(r).toEqual({ total: 10, components: { anthropic: 0, openai: 0, google: 10 } });
  });

  it('components always sum to the total', () => {
    const r = resolveHeartbeatDelta({ components: { anthropic: 7, openai: 11, google: 13 } })!;
    expect(r.components.anthropic + r.components.openai + r.components.google).toBe(r.total);
  });

  it('falls back to a legacy bare delta, attributed to anthropic', () => {
    expect(resolveHeartbeatDelta({ delta: 250 })).toEqual({
      total: 250, components: { anthropic: 250, openai: 0, google: 0 },
    });
  });

  it('returns null when neither components nor a valid delta is present', () => {
    expect(resolveHeartbeatDelta({})).toBeNull();
    expect(resolveHeartbeatDelta({ delta: -1 })).toBeNull();
    expect(resolveHeartbeatDelta({ components: null as any })).toBeNull();
  });
});

describe('capBeat', () => {
  const beat = (anthropic: number, openai: number, google = 0) =>
    ({ total: anthropic + openai + google, components: { anthropic, openai, google } });

  it('caps a single beat at 5,000,000 raw tokens', () => {
    expect(MAX_RAW_TOKENS_PER_BEAT).toBe(5_000_000);
  });

  it('leaves a beat at or under the cap alone', () => {
    expect(capBeat(beat(4_000_000, 1_000_000))).toEqual({ ...beat(4_000_000, 1_000_000), discarded: 0 });
  });

  it('throws away everything above the cap', () => {
    const r = capBeat(beat(0, 30_405_384));
    expect(r.total).toBe(5_000_000);
    expect(r.components).toEqual({ anthropic: 0, openai: 5_000_000, google: 0 });
    expect(r.discarded).toBe(25_405_384);
  });

  it('keeps each family\'s share and still sums exactly to the cap', () => {
    const r = capBeat(beat(6_000_000, 3_000_000, 1_000_001));
    expect(r.components.anthropic + r.components.openai + r.components.google).toBe(5_000_000);
    expect(r.components.anthropic).toBeCloseTo(3_000_000, -1);
    expect(r.components.openai).toBeCloseTo(1_500_000, -1);
    expect(r.total).toBe(5_000_000);
  });
});
