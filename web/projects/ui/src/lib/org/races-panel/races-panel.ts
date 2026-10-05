import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { Marquee } from '../../horse-chip/marquee';
import { Countdown } from '../../race/countdown/countdown';
import { compactTokens } from '../../format/compact-tokens';
import type { RacesPanelView } from '../models';

/** The dashboard's RACES panel: the next race, then the latest results. */
@Component({
  selector: 'td-org-races-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, Marquee, Countdown],
  templateUrl: './races-panel.html',
  styleUrl: './races-panel.scss',
})
export class RacesPanel {
  readonly view = input.required<RacesPanelView>();
  protected readonly compact = (n: number | null) => (n === null ? '—' : compactTokens(n));
}
