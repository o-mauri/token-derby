import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { TokenBreakdown } from '../../src/ui/StatusScreen.js';

describe('TokenBreakdown', () => {
  it('shows three per-model counts with primary/10% tags and a race score', () => {
    const { lastFrame } = render(
      <TokenBreakdown
        primaryModel="codex"
        perSource={{ claude: 1_240_000, codex: 310_000, gemini: 52_000 }}
        raceScore={439_200}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/Claude/);
    expect(out).toMatch(/Codex/);
    expect(out).toMatch(/Gemini/);
    expect(out).toMatch(/primary/);
    expect(out).toMatch(/10%/);
    expect(out).toMatch(/Race score/);
    expect(out).toMatch(/439,200/);
  });
});
