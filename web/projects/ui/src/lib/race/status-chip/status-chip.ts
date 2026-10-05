import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { LaneState } from '../models';

/** The race's state as a small tinted chip; live gets a pulsing on-air dot. */
@Component({
  selector: 'td-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.pending]': "status() === 'pending'",
    '[class.live]': "status() === 'live'",
    '[class.finished]': "status() === 'finished'",
    '[class.unknown]': 'status() === null',
  },
  template: `
    @if (status() === 'live') { <span class="dot" aria-hidden="true"></span> }
    <span class="text">{{ status() ?? '—' }}</span>
  `,
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly status = input.required<LaneState | null>();
}
