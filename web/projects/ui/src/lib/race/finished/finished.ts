import { ChangeDetectionStrategy, Component, computed, contentChildren, input } from '@angular/core';
import { TimedTab, TimedTabs } from '../../timed-tabs/timed-tabs';
import { Confetti } from '../confetti/confetti';
import { Podium } from '../podium/podium';
import { ResultBoard, boardPages } from '../result-board/result-board';
import type { FinishView } from '../models';

/** The finished race: title, a confetti burst, the podium, then timed tabs over the board pages
 *  followed by any extra tabs the page projects (charts, season standings). */
@Component({
  selector: 'td-finished',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TimedTabs, TimedTab, Confetti, Podium, ResultBoard],
  template: `
    <td-confetti />
    <header class="title"><span class="race">RESULT · {{ raceName() }}</span><span class="field">FINAL · {{ results().length }} RUNNERS</span></header>
    <td-podium [top]="top()" />
    <td-timed-tabs class="tabs" [interval]="interval()" [extraTabs]="extra()">
      @for (page of pages(); track page.label) {
        <ng-template tdTab [label]="page.label"><td-result-board [rows]="page.rows" /></ng-template>
      }
    </td-timed-tabs>
  `,
  styleUrl: './finished.scss',
})
export class Finished {
  readonly raceName = input.required<string>();
  readonly results = input.required<readonly FinishView[]>();
  readonly perPage = input(8);
  readonly interval = input(10_000);

  protected readonly extra = contentChildren(TimedTab);
  private readonly sorted = computed(() => [...this.results()].sort((a, b) => a.position - b.position));
  protected readonly top = computed(() => this.sorted().filter((h) => h.position <= 3));
  protected readonly pages = computed(() => boardPages(this.sorted().filter((h) => h.position > 3), this.perPage()));
}
