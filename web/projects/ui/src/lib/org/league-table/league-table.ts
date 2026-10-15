import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HorseHead } from '../../horse-head/horse-head';
import { Marquee } from '../../horse-chip/marquee';
import type { LeagueDivisionView } from '../models';

const MEDALS = ['gold', 'silver', 'bronze'];

/** One league division's table: place, horse, owner and points, with the promotion and relegation places edged. */
@Component({
  selector: 'td-league-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HorseHead, Marquee],
  templateUrl: './league-table.html',
  styleUrl: './league-table.scss',
})
export class LeagueTable {
  readonly division = input.required<LeagueDivisionView>();
  protected readonly medal = (place: number) => MEDALS[place - 1] ?? '';
}
