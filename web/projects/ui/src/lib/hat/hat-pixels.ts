import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { type Hat as HatDef, channelColor, hatColors, isAnimatedHat } from '@token-derby/shared';

export type HatPixel = { x: number; y: number; channel: string; fill: string };
export type WornHat = { id: string; variant?: number };

/** A hat's filled pixels in horse-sprite coordinates: the bottom 4 rows sit on the head at y=0..3. */
export function hatPixels(hat: HatDef, variant = 0): HatPixel[] {
  const ext = Math.max(0, hat.rows.length - 4);
  const colors = hatColors(hat, variant);
  return hat.rows.flatMap((row, i) =>
    [...row].flatMap((ch, j) =>
      ch === '.' ? [] : [{ x: hat.anchor_x + j, y: i - ext, channel: ch.toLowerCase(), fill: channelColor(colors, ch) }],
    ),
  );
}

/** The hat as an SVG group, so it can be drawn inside the horse sprite or on its own. */
@Component({
  selector: 'g[tdHatPixels]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.class]': '"horse-hat horse-hat-" + hat().id' },
  template: `
    @for (p of pixels(); track $index) {
      <svg:rect [attr.x]="p.x" [attr.y]="p.y" width="1" height="1" [attr.class]="'hat-' + p.channel" [attr.fill]="p.fill">
        @if (frames() && p.channel === 'a') {
          <svg:animate attributeName="fill" calcMode="discrete" repeatCount="indefinite"
            [attr.values]="frames()" [attr.dur]="duration()" />
        }
      </svg:rect>
    }
  `,
})
export class HatPixels {
  readonly hat = input.required<HatDef>();
  readonly variant = input(0);

  private readonly reducedMotion = toSignal(
    inject(BreakpointObserver).observe('(prefers-reduced-motion: reduce)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly pixels = computed(() => hatPixels(this.hat(), this.variant()));
  // Legendary hats cycle their A channel, one held frame at a time.
  protected readonly frames = computed(() => {
    const hat = this.hat();
    return isAnimatedHat(hat) && !this.reducedMotion() ? hat.animation.frames.join(';') : null;
  });
  protected readonly duration = computed(() => {
    const hat = this.hat();
    return isAnimatedHat(hat) ? `${hat.animation.frames.length / hat.animation.fps}s` : null;
  });
}
