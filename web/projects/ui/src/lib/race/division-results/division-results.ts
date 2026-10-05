import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { ColumnTemplate, ColumnWindow } from '../../layout/column-window/column-window';
import type { DivisionResult } from '../logic/league';

const MEDALS = ['gold', 'silver', 'bronze'];

/** A league race's result split by division, side by side: place, horse, tokens and league points. */
@Component({
  selector: 'td-division-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, ColumnWindow, ColumnTemplate],
  template: `
    <td-column-window label="divisions">
      @for (d of results(); track d.division) {
        <ng-template tdColumn [header]="d.name">
          <section class="division">
            <header class="title-bar"><span class="title">{{ d.name }}</span><span class="count">{{ d.rows.length }} runners</span></header>
            @for (h of d.rows; track h.id) {
              <div class="row">
                <span class="place" [class]="'place ' + (medal(h.place) ?? '')">{{ h.place }}</span>
                <span class="sprite"><td-horse [colors]="h.colors" [hat]="h.hat" /></span>
                <span class="who"><span class="name">{{ h.name }}</span>&ngsp;<span class="owner">{{ h.owner }}</span></span>
                <span class="tokens led">{{ fmt(h.tokens) }}</span>
                <span class="pts plus">+{{ h.points }} pts</span>
              </div>
            }
          </section>
        </ng-template>
      }
    </td-column-window>
  `,
  styleUrl: './division-results.scss',
})
export class DivisionResults {
  readonly results = input.required<readonly DivisionResult[]>();
  protected readonly fmt = (n: number) => n.toLocaleString('en-US');
  protected readonly medal = (place: number) => MEDALS[place - 1] ?? null;
}
