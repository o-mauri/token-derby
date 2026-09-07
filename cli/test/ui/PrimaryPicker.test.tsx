import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { piModelKey, type ModelKey } from '@token-derby/shared';
import { PrimaryPicker } from '../../src/ui/PrimaryPicker.js';

function tick() { return new Promise<void>(resolve => setTimeout(resolve, 0)); }

const qwen = piModelKey('qwen', 'qwen3-coder')!;
const models: ModelKey[] = ['claude', qwen];

describe('PrimaryPicker', () => {
  it('shows dynamically discovered Pi provider/model buckets', async () => {
    const { lastFrame } = render(<PrimaryPicker models={models} onPick={() => {}} />);
    await tick();
    expect(lastFrame()).toContain('qwen/qwen3-coder (Pi)');
  });

  it('returns a selected Pi provider/model key unchanged', async () => {
    const onPick = vi.fn();
    const { stdin } = render(<PrimaryPicker models={models} onPick={onPick} />);
    await tick();
    stdin.write('\x1B[B');
    await tick();
    stdin.write('\r');
    await tick();
    expect(onPick).toHaveBeenCalledWith(qwen);
  });
});
