import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HorsePicker } from '../../src/ui/HorsePicker.js';
import type { StableHorse } from '@token-derby/shared';

// Flush React effects and state updates (effects register via setTimeout in Ink's reconciler)
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 0)); }

const stable: StableHorse[] = [
  { stable_horse_id: '00000000-0000-0000-0000-00000000000a', name: 'Gary', colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' }, created_at: '2026-01-01T00:00:00Z', xp: 0 },
  { stable_horse_id: '00000000-0000-0000-0000-00000000000b', name: 'Pony', colors: { body: '#FFFFFF', mane: '#000', tail: '#000', saddle: '#1B4F72' }, created_at: '2026-01-02T00:00:00Z', xp: 150 },
  { stable_horse_id: '00000000-0000-0000-0000-00000000000c', name: 'Dash', colors: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' }, created_at: '2026-01-03T00:00:00Z', xp: 1500 },
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

  it('renders level chip next to each horse name (derived from xp)', async () => {
    const { lastFrame } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    const frame = lastFrame() ?? '';
    // Gary has 0 XP → Lvl. 1; Pony has 150 → Lvl. 2 (≥ 50); Dash has 1500 → Lvl. 7 (≥ 1317)
    expect(frame).toMatch(/Gary\s+\[Lvl\. 1\]/);
    expect(frame).toMatch(/Pony\s+\[Lvl\. 2\]/);
    expect(frame).toMatch(/Dash\s+\[Lvl\. 7\]/);
  });

  it('renders empty-state message when stable is empty', async () => {
    const { lastFrame } = render(<HorsePicker horses={[]} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    expect(lastFrame()).toContain('No horses in your stable');
  });

  it('uses the default prompt when none is given', async () => {
    const { lastFrame } = render(<HorsePicker horses={stable} onPick={() => {}} onCancel={() => {}} />);
    await tick();
    expect(lastFrame() ?? '').toContain('Pick a horse to race:');
  });

  it('uses a custom prompt when given', async () => {
    const { lastFrame } = render(
      <HorsePicker horses={stable} prompt="Which horse should wear it?" onPick={() => {}} onCancel={() => {}} />,
    );
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Which horse should wear it?');
    expect(frame).not.toContain('Pick a horse to race:');
  });
});
