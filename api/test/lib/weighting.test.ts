import { describe, it, expect } from 'vitest';
import { resolveHeartbeatDelta } from '../../src/lib/weighting.js';

describe('resolveHeartbeatDelta', () => {
  it('weights components: primary at 1, others at 0.1', () => {
    const d = resolveHeartbeatDelta({ components: { claude: 1000, codex: 500, gemini: 200 } }, 'codex');
    // 500*1 + 1000*0.1 + 200*0.1 = 500 + 100 + 20 = 620
    expect(d).toBe(620);
  });

  it('all-primary components pass straight through', () => {
    expect(resolveHeartbeatDelta({ components: { claude: 300, codex: 0, gemini: 0 } }, 'claude')).toBe(300);
  });

  it('falls back to a legacy bare delta (primary-only semantics)', () => {
    expect(resolveHeartbeatDelta({ delta: 250 }, 'claude')).toBe(250);
  });

  it('prefers components over a legacy delta when both present', () => {
    const d = resolveHeartbeatDelta({ delta: 9999, components: { claude: 100, codex: 0, gemini: 0 } }, 'claude');
    expect(d).toBe(100);
  });

  it('treats negative or non-finite component values as 0', () => {
    const d = resolveHeartbeatDelta({ components: { claude: -5, codex: Infinity as any, gemini: 10 } }, 'claude');
    // claude -5→0 (×1), codex Inf→0 (×0.1), gemini 10 (×0.1) = 1
    expect(d).toBe(1);
  });

  it('returns null when neither components nor a valid delta is present', () => {
    expect(resolveHeartbeatDelta({}, 'claude')).toBeNull();
    expect(resolveHeartbeatDelta({ delta: -1 }, 'claude')).toBeNull();
    expect(resolveHeartbeatDelta({ components: null as any }, 'claude')).toBeNull();
  });
});
