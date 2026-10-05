import { TestBed } from '@angular/core/testing';
import { Loader } from './loader';

describe('Loader', () => {
  it('announces itself as a status with the porthole and two horses', async () => {
    const f = TestBed.createComponent(Loader);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toContain('Loading…');
    expect(el.querySelector('.loader-ring .loader-porthole .loader-track')).not.toBeNull();
    expect(el.querySelectorAll('.loader-horse td-horse.running').length).toBe(2);
    expect(el.querySelector('.loader-horse.far')).not.toBeNull();
    expect(el.querySelector('.loader-horse.near td-horse.offset')).not.toBeNull();
  });

  const injectedCss = () => [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');

  it('stays hidden for the first 250ms so fast loads never flash it', async () => {
    await TestBed.createComponent(Loader).whenStable();
    expect(injectedCss()).toMatch(/animation:\s*\S*loader-appear (150ms|var\(--td-duration-appear\))[^;]*250ms/);
  });

  // Loader styles can't reach into td-horse, so each must stop its own animation.
  it('stops its own and its horses\' animation under reduced motion', async () => {
    await TestBed.createComponent(Loader).whenStable();
    const blocks = injectedCss().match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });
});
