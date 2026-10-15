import { ChangeDetectionStrategy, Component, InjectionToken, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';

/** Source of randomness for the pieces; a token so tests get a fixed burst. */
export const CONFETTI_RANDOM = new InjectionToken<() => number>('CONFETTI_RANDOM', { factory: () => Math.random });

const COUNT = 46;
const COLOURS = [1, 2, 3, 4, 5, 6].map((n) => `var(--td-confetti-${n})`);
const SIZES = [4, 5, 6];

/** A single burst of pixel confetti over its container, about 3s, then gone. Nothing under reduced motion. */
@Component({
  selector: 'td-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (!reducedMotion()) {
      @for (p of pieces; track $index) {
        <i class="piece" [style.left.%]="p.left" [style.background]="p.colour" [style.width.px]="p.size" [style.height.px]="p.size"
          [style.animation-delay.s]="p.delay" [style.--spin.deg]="p.spin"></i>
      }
    }
  `,
  styleUrl: './confetti.scss',
})
export class Confetti {
  private readonly rand = inject(CONFETTI_RANDOM);
  protected readonly reducedMotion = toSignal(
    inject(BreakpointObserver).observe('(prefers-reduced-motion: reduce)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly pieces = Array.from({ length: COUNT }, (_, i) => ({
    left: Math.round(this.rand() * 1000) / 10,
    colour: COLOURS[i % COLOURS.length]!,
    size: SIZES[Math.floor(this.rand() * SIZES.length) % SIZES.length]!,
    delay: Math.round(this.rand() * 80) / 100,
    spin: 360 + Math.round(this.rand() * 360),
  }));
}
