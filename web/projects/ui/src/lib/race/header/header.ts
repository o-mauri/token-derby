import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../../button/button';
import { HorseFace } from '../../horse-face/horse-face';
import { Marquee } from '../../horse-chip/marquee';
import { Countdown } from '../countdown/countdown';
import { StatusChip } from '../status-chip/status-chip';
import type { CountdownAnchor } from '../logic/time';
import type { LaneState } from '../models';

/** The race page's top bar. Emits its button presses; the page decides where they go.
 *  Projected content (the theme picker) sits between the readouts and the back buttons. */
@Component({
  selector: 'td-race-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, HorseFace, Marquee, Countdown, StatusChip],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class RaceHeader {
  // Leave blank until the API answers, so the title doesn't jump when the real name lands.
  readonly name = input.required<string>();
  readonly status = input.required<LaneState | null>();
  readonly anchor = input.required<CountdownAnchor | null>();
  readonly joinCode = input.required<string>();
  readonly orgName = input<string | null>(null);
  readonly showGraphs = input(true);

  readonly home = output<void>();
  readonly org = output<void>();
  readonly graphs = output<void>();
}
