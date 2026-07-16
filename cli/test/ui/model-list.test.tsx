import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ModelList } from '../../src/ui/StatusScreen.js';

describe('ModelList', () => {
  it('shows all three model names', () => {
    const out = render(<ModelList primaryModel="codex" />).lastFrame()!;
    expect(out).toMatch(/Claude/);
    expect(out).toMatch(/Codex/);
    expect(out).toMatch(/Gemini/);
  });

  it('marks the primary model and only the primary', () => {
    const out = render(<ModelList primaryModel="codex" />).lastFrame()!;
    expect(out).toMatch(/Codex \(primary\)/);
    expect(out).not.toMatch(/Claude \(primary\)/);
    expect(out).not.toMatch(/Gemini \(primary\)/);
  });

  it('tags non-primary models with the secondary weight and shows no token counts', () => {
    const out = render(<ModelList primaryModel="codex" />).lastFrame()!;
    expect(out).toMatch(/Claude \(50%\)/);
    expect(out).toMatch(/Gemini \(50%\)/);
    expect(out).toMatch(/Codex \(primary\)/);
    // no raw token counts (the only digits are the weight tag)
    expect(out).not.toMatch(/\d[\d,]{2,}/);
  });
});
