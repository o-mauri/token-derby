import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { Countdown, NOW } from '../countdown/countdown';
import { countdownSeconds } from '../logic/time';

/** The panel above the track before the off: a countdown to the start, then "Starting…". */
@Component({
  selector: 'td-pending-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Countdown],
  host: { role: 'status' },
  template: `
    @if (started()) {
      <span class="text">Starting…</span>
    } @else {
      <span class="text">Race starts in</span>
      <td-countdown class="clock" [anchor]="anchor()" (done)="started.set(true)" />
    }
  `,
  styleUrl: './pending-banner.scss',
})
export class PendingBanner {
  readonly startsAt = input.required<string>();

  private readonly now = inject(NOW);
  protected readonly anchor = computed(() => {
    const at = this.now();
    return { atMs: at, timeLeftSeconds: countdownSeconds(this.startsAt(), new Date(at)) };
  });
  // Re-armed whenever a new start time arrives.
  protected readonly started = linkedSignal(() => this.anchor().timeLeftSeconds === 0);
}
