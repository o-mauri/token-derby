import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { Confetti, CONFETTI_RANDOM } from './confetti';

function render(reducedMotion: boolean) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CONFETTI_RANDOM, useValue: () => 0.5 },
      { provide: BreakpointObserver, useValue: { observe: () => of({ matches: reducedMotion, breakpoints: {} }) } },
    ],
  });
  const f = TestBed.createComponent(Confetti);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('Confetti', () => {
  it('drops a burst of pixel pieces in the confetti colours, hidden from screen readers', () => {
    const el = render(false);
    const pieces = [...el.querySelectorAll<HTMLElement>('.piece')];
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(pieces.length).toBe(46);
    expect(pieces[0]!.style.left).toBe('50%');
    expect(new Set(pieces.map((p) => p.style.background)).size).toBe(6);
  });

  it('drops nothing under reduced motion', () => {
    expect(render(true).querySelectorAll('.piece').length).toBe(0);
  });
});
