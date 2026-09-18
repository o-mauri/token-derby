import { describe, it, expect } from 'vitest';
import { resolveHeartbeatDelta } from '../../src/lib/heartbeat-delta.js';

describe('resolveHeartbeatDelta', () => {
  it('sums every model at equal weight', () => {
    const r = resolveHeartbeatDelta({ components: { claude: 1000, codex: 500, gemini: 200 } });
    expect(r).toEqual({ total: 1700, components: { claude: 1000, codex: 500, gemini: 200 } });
  });

  it('a single-model beat passes straight through', () => {
    expect(resolveHeartbeatDelta({ components: { claude: 300, codex: 0, gemini: 0 } })?.total).toBe(300);
  });

  it('falls back to a legacy bare delta, attributed to claude', () => {
    // Pre-components CLIs sent one scalar, scored as the (then default) primary.
    expect(resolveHeartbeatDelta({ delta: 250 })).toEqual({
      total: 250, components: { claude: 250, codex: 0, gemini: 0 },
    });
  });

  it('prefers components over a legacy delta when both present', () => {
    expect(resolveHeartbeatDelta({ delta: 9999, components: { claude: 100, codex: 0, gemini: 0 } })?.total).toBe(100);
  });

  it('treats negative or non-finite component values as 0', () => {
    const r = resolveHeartbeatDelta({ components: { claude: -5, codex: Infinity as any, gemini: 10 } });
    expect(r).toEqual({ total: 10, components: { claude: 0, codex: 0, gemini: 10 } });
  });

  it('components always sum to the total', () => {
    const r = resolveHeartbeatDelta({ components: { claude: 7, codex: 11, gemini: 13 } })!;
    expect(r.components.claude + r.components.codex + r.components.gemini).toBe(r.total);
  });

  it('returns null when neither components nor a valid delta is present', () => {
    expect(resolveHeartbeatDelta({})).toBeNull();
    expect(resolveHeartbeatDelta({ delta: -1 })).toBeNull();
    expect(resolveHeartbeatDelta({ components: null as any })).toBeNull();
  });
});
