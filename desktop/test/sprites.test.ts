// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import HorseSprite from '../src/sprites/HorseSprite.js';

// react-dom's act() warns unless this is set — happy-dom isn't detected by
// its jsdom-specific heuristic even though it behaves the same for our needs.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COLORS = { body: '#8B4513', mane: '#f5e9d3', tail: '#f5e9d3', saddle: '#3d2856' };

function mount(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('HorseSprite', () => {
  it('renders an svg.horse-sprite with pixel rects', () => {
    const { container, unmount } = mount(React.createElement(HorseSprite, { colors: COLORS, size: 48 }));

    const svg = container.querySelector('svg.horse-sprite');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(0);

    unmount();
  });

  it('sizes the wrapper from the size prop', () => {
    const { container, unmount } = mount(React.createElement(HorseSprite, { colors: COLORS, size: 80 }));

    const wrap = container.querySelector('.horse-sprite-wrap') as HTMLElement;
    expect(wrap.style.width).toBe('80px');
    expect(wrap.style.height).toBe('80px');

    unmount();
  });

  it('sets the horse colors as CSS custom properties', () => {
    const { container, unmount } = mount(React.createElement(HorseSprite, { colors: COLORS }));

    const wrap = container.querySelector('.horse-sprite-wrap') as HTMLElement;
    expect(wrap.style.getPropertyValue('--body')).toBe(COLORS.body);
    expect(wrap.style.getPropertyValue('--saddle')).toBe(COLORS.saddle);

    unmount();
  });

  it('appends a hat group when an equipped hat is given', () => {
    const { container, unmount } = mount(
      React.createElement(HorseSprite, {
        colors: COLORS,
        hat: { id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() },
      }),
    );

    const hatGroup = container.querySelector('g.horse-hat-flat_cap');
    expect(hatGroup).not.toBeNull();
    expect(hatGroup!.querySelectorAll('rect').length).toBeGreaterThan(0);

    unmount();
  });

  it('renders no hat group when no hat is equipped', () => {
    const { container, unmount } = mount(React.createElement(HorseSprite, { colors: COLORS, hat: null }));

    expect(container.querySelector('.horse-hat')).toBeNull();

    unmount();
  });
});
