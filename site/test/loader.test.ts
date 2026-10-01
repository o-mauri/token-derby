import { describe, it, expect } from 'vitest';
import { createLoader } from '../src/render/loader.js';

describe('createLoader', () => {
  it('announces itself as a status with a Loading… caption', () => {
    const el = createLoader(document);
    expect(el.classList.contains('loader')).toBe(true);
    expect(el.getAttribute('role')).toBe('status');
    expect(el.querySelector('.loader-caption')?.textContent).toBe('Loading…');
  });

  it('nests the track inside the porthole inside the spinner ring', () => {
    const el = createLoader(document);
    expect(el.querySelector('.loader-ring > .loader-porthole > .loader-track')).not.toBeNull();
  });

  it('runs a far and a near horse, each with a sprite and a dust trail', () => {
    const track = createLoader(document).querySelector('.loader-track')!;
    const horses = Array.from(track.children).filter((c) => c.classList.contains('loader-horse'));
    expect(horses.map((h) => h.classList.contains('far') ? 'far' : h.classList.contains('near') ? 'near' : '?'))
      .toEqual(['far', 'near']);
    for (const h of horses) {
      expect(h.querySelector('svg.horse-sprite')).not.toBeNull();
      expect(h.querySelector('.horse-dust')).not.toBeNull();
    }
  });

  it('paints the two horses in distinct fixed colours', () => {
    const [far, near] = Array.from(createLoader(document).querySelectorAll<HTMLElement>('.loader-horse'));
    expect(far!.style.getPropertyValue('--body')).toBe('#d9d4cc');
    expect(far!.style.getPropertyValue('--saddle')).toBe('#3b82f6');
    expect(near!.style.getPropertyValue('--body')).toBe('#8B4513');
    expect(near!.style.getPropertyValue('--saddle')).toBe('#d94848');
  });

  it('keeps the sprites out of the race view’s .horse lookups', () => {
    expect(createLoader(document).querySelector('.horse')).toBeNull();
  });
});
