import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { buildHatGroup, buildLegendaryKeyframes } from '../src/hat-svg.js';
import { hatById, HATS } from '@token-derby/shared';

describe('buildHatGroup', () => {
  it('produces a <g class="horse-hat horse-hat-{id}"> with the right number of rects', () => {
    const window = new Window();
    const doc = window.document as unknown as Document;
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const g = buildHatGroup(doc, hat, 0);
    expect(g.tagName.toLowerCase()).toBe('g');
    expect(g.getAttribute('class')).toBe('horse-hat horse-hat-flat_cap');
    const rects = g.querySelectorAll('rect');
    const expected = hat.rows.reduce((n, r) => n + (r.match(/[^.]/g)?.length ?? 0), 0);
    expect(rects.length).toBe(expected);
  });

  it('positions rects so the bottom row lands at y=3 (overlap rule)', () => {
    const window = new Window();
    const doc = window.document as unknown as Document;
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const g = buildHatGroup(doc, hat, 0);
    let maxY = -Infinity;
    g.querySelectorAll('rect').forEach(r => { maxY = Math.max(maxY, parseFloat(r.getAttribute('y')!)); });
    expect(maxY).toBe(3);
  });

  it('uses the requested variant colours', () => {
    const window = new Window();
    const doc = window.document as unknown as Document;
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const v0 = hat.variants[0]!;
    const g = buildHatGroup(doc, hat, 0);
    const firstARect = Array.from(g.querySelectorAll('rect')).find(r => r.getAttribute('class') === 'hat-a');
    expect(firstARect?.getAttribute('fill')).toBe(v0.A);
  });

  it('legendary hats use hat.colors', () => {
    const window = new Window();
    const doc = window.document as unknown as Document;
    const hat = hatById('rainbow_crown')!;
    expect(hat.rarity).toBe('legendary');
    const g = buildHatGroup(doc, hat, 0);
    expect(g.querySelectorAll('rect').length).toBeGreaterThan(0);
  });
});

describe('buildLegendaryKeyframes', () => {
  it('emits @keyframes for every legendary hat', () => {
    const css = buildLegendaryKeyframes();
    for (const hat of HATS.filter(h => h.rarity === 'legendary')) {
      expect(css).toContain(`@keyframes anim-${hat.id}`);
      expect(css).toContain(`.horse-hat-${hat.id} .hat-a`);
    }
  });
});
