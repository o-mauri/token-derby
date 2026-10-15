import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { Marquee } from '../../horse-chip/marquee';
import { Countdown } from '../../race/countdown/countdown';
import { StatusChip } from '../../race/status-chip/status-chip';
import { compactTokens } from '../../format/compact-tokens';
import type { LivePanelView } from '../models';

/** The dashboard's LIVE panel: the race on now (or next), its leader as the hero, and the chasing pack. */
@Component({
  selector: 'td-org-live-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, Marquee, Countdown, StatusChip],
  templateUrl: './live-panel.html',
  styleUrl: './live-panel.scss',
})
export class LivePanel {
  readonly view = input.required<LivePanelView>();
  protected readonly compact = compactTokens;
}
