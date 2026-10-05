import { ChangeDetectionStrategy, Component, DestroyRef, InjectionToken, computed, inject, input, signal } from '@angular/core';
import { type CountdownAnchor, formatDuration, predictTimeLeftSeconds } from '../logic/time';

/** The current time in ms; a token so tests can move the clock. */
export const NOW = new InjectionToken<() => number>('NOW', { factory: () => () => Date.now() });

const TICK_MS = 1000;
const BLANK = '--:--:--';

/** Time left as a dot-matrix digital clock, counting down every second from the last poll's anchor. */
@Component({
  selector: 'td-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'timer', '[attr.aria-label]': 'label()' },
  template: `
    @for (c of chars(); track $index) {
      <span class="cell" [class.colon]="c === ':'" aria-hidden="true">{{ c }}</span>
    }
  `,
  styleUrl: './countdown.scss',
})
export class Countdown {
  readonly anchor = input.required<CountdownAnchor | null>();

  private readonly now = inject(NOW);
  private readonly tick = signal(this.now());
  protected readonly text = computed(() => {
    const anchor = this.anchor();
    this.tick();
    return anchor ? formatDuration(predictTimeLeftSeconds(anchor, this.now())) : BLANK;
  });
  protected readonly chars = computed(() => [...this.text()]);
  protected readonly label = computed(() => (this.anchor() ? `${this.text()} left` : 'Time left unknown'));

  constructor() {
    const id = setInterval(() => this.tick.set(this.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
