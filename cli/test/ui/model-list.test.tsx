import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { piModelKey } from '@token-derby/shared';
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

  it('renders discovered Pi provider/model buckets and can mark one primary', () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    const openai = piModelKey('openai-codex', 'gpt-5.3-codex')!;
    const out = render(<ModelList primaryModel={qwen} modelKeys={['claude', qwen, openai]} />).lastFrame()!;
    expect(out).toMatch(/qwen\/qwen3-coder \(Pi\) \(primary\)/);
    expect(out).toMatch(/openai-codex\/gpt-5\.3-codex \(Pi\) \(50%\)/);
    expect(out).toMatch(/Claude \(50%\)/);
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
