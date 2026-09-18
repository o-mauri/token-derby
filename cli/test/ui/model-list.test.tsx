import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ModelList } from '../../src/ui/StatusScreen.js';

describe('ModelList', () => {
  it('shows all three model names', () => {
    const out = render(<ModelList />).lastFrame()!;
    expect(out).toMatch(/Claude/);
    expect(out).toMatch(/Codex/);
    expect(out).toMatch(/Gemini/);
  });

  it('singles out no model — they all count the same', () => {
    const out = render(<ModelList />).lastFrame()!;
    expect(out).not.toMatch(/primary/i);
    expect(out).not.toMatch(/%/);
    expect(out).toMatch(/all count the same/);
  });

  it('shows no token counts', () => {
    const out = render(<ModelList />).lastFrame()!;
    expect(out).not.toMatch(/\d[\d,]{2,}/);
  });
});
