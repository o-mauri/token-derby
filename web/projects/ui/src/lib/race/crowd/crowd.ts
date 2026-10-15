import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, booleanAttribute, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';
import { type CheerJitter, cheerJitter, crowdColumns, resizeCrowd } from '../logic/crowd';

/** Source of randomness for cheer timings; a token so tests get a fixed crowd. */
export const CROWD_RANDOM = new InjectionToken<() => number>('CROWD_RANDOM', { factory: () => Math.random });

const SPRITE_SCALE = 3;

/** The grandstand above the track: one spectator sprite per tile across its width, each cheering on its own beat. */
@Component({
  selector: 'td-crowd',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.paused]': 'paused()' },
  template: `
    <div class="cap left" [style.--cheer-duration]="ms(caps[0].durationMs)" [style.--cheer-delay]="ms(caps[0].delayMs)"></div>
    @for (p of spectators(); track $index) {
      <div class="person" [style.--cheer-duration]="ms(p.durationMs)" [style.--cheer-delay]="ms(p.delayMs)"></div>
    }
    <div class="cap right" [style.--cheer-duration]="ms(caps[1].durationMs)" [style.--cheer-delay]="ms(caps[1].delayMs)"></div>
  `,
  styleUrl: './crowd.scss',
})
export class Crowd {
  // Stops the cheering once the race is over.
  readonly paused = input(false, { transform: booleanAttribute });

  private readonly rand = inject(CROWD_RANDOM);
  private readonly width = signal(0);
  protected readonly caps = [cheerJitter(this.rand), cheerJitter(this.rand)] as const;
  // The two caps take a tile each; existing spectators carry over when the width changes.
  protected readonly spectators = linkedSignal<number, CheerJitter[]>({
    source: computed(() => crowdColumns(this.width(), SPRITE_SCALE) - 2),
    computation: (count, previous) => resizeCrowd(previous?.value ?? [], count, this.rand),
  });
  protected readonly ms = (n: number) => `${n}ms`;

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const Observer = inject(RESIZE_OBSERVER);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (!Observer) return;
      const ro = new Observer(([entry]) => this.width.set(entry?.contentRect.width ?? 0));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }
}
