import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Horse } from '../../horse/horse';
import { ColumnTemplate, ColumnWindow } from '../../layout/column-window/column-window';
import type { SeasonRowView, SeasonView } from '../logic/league';

/** The season table after a league race: points, this race's gain, movement and the zones, per division. */
@Component({
  selector: 'td-season-standings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, ColumnWindow, ColumnTemplate],
  template: `
    @let v = view();
    @if (v.champion; as c) {
      <p class="champion"><span class="label">SEASON {{ v.season }} CHAMPION</span> · <span class="champ">{{ c.name }}</span> ({{ c.owner }}) · {{ c.division }}</p>
    }
    <p class="heading">Season {{ v.season }} · after round {{ v.round }} of {{ v.total }}</p>
    <td-column-window label="divisions">
      @for (d of v.divisions; track d.division) {
        <ng-template tdColumn [header]="d.name">
          <section class="division">
            <header class="title-bar"><span class="title">{{ d.name }}</span></header>
            @for (h of d.rows; track h.stableId) {
              <div class="row" [class.promote]="h.zone === 'promote'" [class.relegate]="h.zone === 'relegate'">
                <span class="rank">{{ h.rank }}</span>
                <span class="move" [class]="'move ' + moveClass(h)">
                  @if (h.movement === 'new') { <span class="new">NEW</span> } @else { {{ moveText(h) }} }
                </span>
                <span class="sprite">@if (h.colors) { <td-horse [colors]="h.colors" [hat]="h.hat" /> }</span>
                <span class="who"><span class="name">{{ h.name }}</span></span>
                <span class="points led">{{ h.points }}</span>
                <span class="gain-col">@if (h.gain > 0) { <span class="gain plus">+{{ h.gain }}</span> }</span>
              </div>
            }
          </section>
        </ng-template>
      }
    </td-column-window>
    <p class="legend"><span class="key promote">Promotion</span><span class="key relegate">Relegation</span></p>
  `,
  styleUrl: './season-standings.scss',
})
export class SeasonStandingsTable {
  readonly view = input.required<SeasonView>();

  protected moveText(h: SeasonRowView): string {
    if (typeof h.movement !== 'number') return '–';
    return h.movement > 0 ? `▲${h.movement}` : `▼${-h.movement}`;
  }

  protected moveClass(h: SeasonRowView): string {
    if (typeof h.movement !== 'number') return '';
    return h.movement > 0 ? 'up' : 'down';
  }
}
