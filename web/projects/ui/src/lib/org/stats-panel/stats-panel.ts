import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { Marquee } from '../../horse-chip/marquee';
import { compactTokens } from '../../format/compact-tokens';
import type { StatsPanelView } from '../models';

/** The dashboard's STATS panel: races run, the most frequent winner, total tokens and the last ten races' totals. */
@Component({
  selector: 'td-org-stats-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, Marquee],
  templateUrl: './stats-panel.html',
  styleUrl: './stats-panel.scss',
})
export class StatsPanel {
  readonly view = input.required<StatsPanelView>();

  protected readonly total = computed(() => {
    const t = this.view().totalTokens;
    return t === null ? '—' : compactTokens(t);
  });
  protected readonly bars = computed(() => {
    const values = this.view().lastTen;
    const max = Math.max(0, ...values.map((v) => v ?? 0));
    return values.map((v) => (max > 0 && v !== null ? Math.round((v / max) * 100) : 0));
  });
}
