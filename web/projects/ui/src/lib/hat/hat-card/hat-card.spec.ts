import { TestBed } from '@angular/core/testing';
import { HATS, type Hat, hatColors, isAnimatedHat, variantCount } from '@token-derby/shared';
import { HatCard, needsLightBg, relativeLuminance } from './hat-card';

const CHESTNUT = { body: '#A0522D', mane: '#2F1B0C', tail: '#2F1B0C', saddle: '#8B4513' };

async function render(hat: Hat) {
  const f = TestBed.createComponent(HatCard);
  f.componentRef.setInput('hat', hat);
  f.componentRef.setInput('colors', CHESTNUT);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

const plain = HATS.find((h) => !isAnimatedHat(h) && h.rollable && variantCount(h) > 1)!;
const exclusive = HATS.find((h) => !h.rollable)!;
const animated = HATS.find((h) => isAnimatedHat(h))!;

describe('HatCard', () => {
  it('shows every variant on a horse, numbered', async () => {
    const el = await render(plain);
    expect(el.querySelector('.name')?.textContent).toContain(plain.name);
    const figs = [...el.querySelectorAll('figure.variant')];
    expect(figs).toHaveLength(variantCount(plain));
    expect(figs.map((f) => f.querySelector('figcaption')?.textContent?.trim())).toEqual(figs.map((_, i) => `#${i + 1}`));
    expect(el.querySelectorAll('figure.variant td-horse')).toHaveLength(variantCount(plain));
  });

  it('marks hats that are never rolled', async () => {
    expect((await render(exclusive)).querySelector('.exclusive')?.textContent?.trim()).toBe('Exclusive');
    expect((await render(plain)).querySelector('.exclusive')).toBeNull();
  });

  it('shows an animated hat once, as one of a kind', async () => {
    const el = await render(animated);
    expect(el.querySelectorAll('figure.variant')).toHaveLength(1);
    expect(el.querySelector('figcaption')?.textContent?.trim()).toBe('one of a kind');
  });

  it('puts a light backing behind a hat too dark to see', () => {
    expect(relativeLuminance('#000000')).toBeLessThan(0.18);
    expect(relativeLuminance('#FFD700')).toBeGreaterThan(0.18);
    const dark = HATS.find((h) => !isAnimatedHat(h) && relativeLuminance(hatColors(h, 0).A) < 0.18);
    if (dark) expect(needsLightBg(dark, 0)).toBe(true);
    const bright = HATS.find((h) => !isAnimatedHat(h) && relativeLuminance(hatColors(h, 0).A) > 0.5)!;
    expect(needsLightBg(bright, 0)).toBe(false);
  });
});
