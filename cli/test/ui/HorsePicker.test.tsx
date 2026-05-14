import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorsePicker } from '../../src/ui/HorsePicker.js';
import type { StableHorse } from '../../src/stable/stable.js';

// Flush React effects and state updates (effects register via setTimeout in Ink's reconciler)
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 0)); }

const stable: StableHorse[] = [
  { stable_horse_id: '00000000-0000-0000-0000-00000000000a', name: 'Gary', colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' }, created_at: '2026-01-01T00:00:00Z' },
  { stable_horse_id: '00000000-0000-0000-0000-00000000000b', name: 'Pony', colors: { body: '#FFFFFF', mane: '#000', tail: '#000', saddle: '#1B4F72' }, created_at: '2026-01-02T00:00:00Z' },
  { stable_horse_id: '00000000-0000-0000-0000-00000000000c', name: 'Dash', colors: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' }, created_at: '2026-01-03T00:00:00Z' },
];

describe('HorsePicker', () => {
  it('renders all horses with first highlighted', async () => {
    const { lastFrame } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Gary');
    expect(frame).toContain('Pony');
    expect(frame).toContain('Dash');
    expect(frame).toMatch(/►\s*Gary/);
  });

  it('Down arrow moves highlight', async () => {
    const { lastFrame, stdin } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[B');
    await tick();
    expect(lastFrame()).toMatch(/►\s*Pony/);
  });

  it('Enter calls onPick with the highlighted horse', async () => {
    const onPick = vi.fn();
    const { stdin } = render(<HorsePicker horses={stable} onPick={onPick} onCancel={() => {}} />);
    await tick();
    stdin.write('\x1B[B'); // Pony
    await tick();
    stdin.write('\r');
    await tick();
    expect(onPick).toHaveBeenCalledWith(stable[1]);
  });

  it('Esc calls onCancel', async () => {
    const onCancel = vi.fn();
    const { stdin } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={onCancel} />);
    await tick();
    stdin.write('\x1B');
    await tick();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders empty-state message when stable is empty', async () => {
    const { lastFrame } = render(<HorsePicker horses={[]} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    expect(lastFrame()).toContain('No horses in your stable');
  });
});
