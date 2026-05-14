import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { HatPicker } from '../../src/ui/HatPicker.js';
import type { CollectedHat, HorseColors } from '@token-derby/shared';

const colors: HorseColors = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };
const hats: CollectedHat[] = [
  { id: 'flat_cap', obtained_at: '2026-05-14T00:00:00Z' },
  { id: 'beanie', tint: '#FF0000', obtained_at: '2026-05-14T01:00:00Z' },
];

describe('HatPicker', () => {
  it('renders "No hats" when hat list is empty', () => {
    const { lastFrame } = render(
      React.createElement(HatPicker, { hats: [], colors, equippedIdx: undefined, onDone: vi.fn() }),
    );
    expect(lastFrame()).toContain('No hats');
  });

  it('shows the current hat name', () => {
    const { lastFrame } = render(
      React.createElement(HatPicker, { hats, colors, equippedIdx: 0, onDone: vi.fn() }),
    );
    expect(lastFrame()).toContain('Flat Cap');
  });
});
