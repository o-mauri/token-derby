import { TestBed } from '@angular/core/testing';
import { GRID, SPRITE_HEIGHT, SPRITE_WIDTH } from '@token-derby/shared';
import { Horse } from './horse';

const COLORS = { body: '#8B4513', mane: '#2b1a0e', tail: '#2b1a0e', saddle: '#d94848' };

async function render(running = false, hat: { id: string; variant?: number } | null = null) {
  const f = TestBed.createComponent(Horse);
  f.componentRef.setInput('colors', COLORS);
  f.componentRef.setInput('running', running);
  f.componentRef.setInput('hat', hat);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('Horse', () => {
  it('draws every filled grid cell inside the same viewBox as the old sprite', async () => {
    const el = await render();
    const svg = el.querySelector('svg.horse-sprite')!;
    expect(svg.getAttribute('viewBox')).toBe(`0 -6 ${SPRITE_WIDTH + 3} ${SPRITE_HEIGHT + 6}`);
    const filled = GRID.flat().filter((c) => c !== null).length;
    expect(svg.querySelectorAll('rect').length).toBe(filled);
  });

  it('puts lower back-leg cells under the back knee group', async () => {
    const el = await render();
    const knee = el.querySelector('.leg-back > .leg-back-lower')!;
    const expected = GRID.slice(18).flatMap((row) => row.slice(0, 14).filter((c) => c !== null)).length;
    expect(knee.querySelectorAll('rect').length).toBe(expected);
  });

  it('exposes colours as custom properties and reflects running', async () => {
    const el = await render(true);
    expect(el.style.getPropertyValue('--body')).toBe(COLORS.body);
    expect(el.style.getPropertyValue('--saddle')).toBe(COLORS.saddle);
    expect(el.classList.contains('running')).toBe(true);
  });

  it('wears no hat by default', async () => {
    const el = await render();
    expect(el.querySelector('.horse-hat')).toBeNull();
  });

  it('wears a hat inside its own sprite, on top of the body, sitting flush on the head', async () => {
    const el = await render(false, { id: 'flat_cap', variant: 2 });
    const svg = el.querySelector('svg.horse-sprite')!;
    // jsdom's SVG support lacks :scope and lastElementChild, so walk the child nodes.
    const groups = [...svg.childNodes].filter((n): n is SVGGElement => n.nodeName.toLowerCase() === 'g');
    const hat = groups.find((g) => g.classList.contains('horse-hat'))!;
    expect(groups.at(-1)).toBe(hat);
    expect(groups.at(-2)!.classList.contains('horse-body')).toBe(true);
    const ys = [...hat.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y')));
    // Flat cap's lowest row overlaps the head at y=3 (bottom 4 rows sit on y=0..3).
    expect(Math.max(...ys)).toBe(3);
    expect(hat.querySelector('rect')!.getAttribute('fill')).toBe('#aab5cb');
  });
});
