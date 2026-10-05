import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { HATS, hatById, isAnimatedHat } from '@token-derby/shared';
import { Hat } from './hat';

const filled = (id: string) => hatById(id)!.rows.join('').replace(/\./g, '').length;

async function render(id: string, variant?: number, reducedMotion = false) {
  TestBed.configureTestingModule({
    providers: [{ provide: BreakpointObserver, useValue: { observe: () => of({ matches: reducedMotion, breakpoints: {} }) } }],
  });
  const f = TestBed.createComponent(Hat);
  f.componentRef.setInput('id', id);
  if (variant !== undefined) f.componentRef.setInput('variant', variant);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('Hat', () => {
  it('draws every filled pixel of the hat in the chosen variant', async () => {
    const el = await render('bucket_hat', 1);
    const rects = [...el.querySelectorAll('svg g.horse-hat rect')];
    expect(rects.length).toBe(filled('bucket_hat'));
    expect(rects.some((r) => r.getAttribute('fill') === '#0007cc')).toBe(true);
    expect(rects.some((r) => r.getAttribute('fill') === '#FFFFFF')).toBe(true);
  });

  it('crops its viewBox to the drawn pixels', async () => {
    const el = await render('flat_cap');
    // Flat cap's pixels span rows 7-9 and columns 2-8, anchored at x=23 with 6 rows of overhang.
    expect(el.querySelector('svg')!.getAttribute('viewBox')).toBe('25 1 7 3');
  });

  it('renders nothing for an unknown hat', async () => {
    const el = await render('no_such_hat');
    expect(el.querySelector('svg')).toBeNull();
  });

  it('cycles the A channel of legendary hats with discrete SVG frames', async () => {
    const hat = HATS.find(isAnimatedHat)!;
    const el = await render(hat.id);
    const anims = [...el.querySelectorAll('rect.hat-a > animate')];
    expect(anims.length).toBe([...hat.rows.join('')].filter((c) => c === 'A').length);
    const a = anims[0]!;
    expect(a.getAttribute('attributeName')).toBe('fill');
    expect(a.getAttribute('values')).toBe(hat.animation.frames.join(';'));
    expect(a.getAttribute('calcMode')).toBe('discrete');
    expect(a.getAttribute('dur')).toBe(`${hat.animation.frames.length / hat.animation.fps}s`);
    expect(el.querySelectorAll('rect:not(.hat-a) > animate').length).toBe(0);
  });

  it('holds legendary hats still under reduced motion', async () => {
    const hat = HATS.find(isAnimatedHat)!;
    const el = await render(hat.id, undefined, true);
    expect(el.querySelectorAll('animate').length).toBe(0);
    expect(el.querySelectorAll('rect').length).toBe(filled(hat.id));
  });
});
