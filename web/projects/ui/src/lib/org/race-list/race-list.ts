import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HorseHead } from '../../horse-head/horse-head';
import { Marquee } from '../../horse-chip/marquee';
import { Countdown } from '../../race/countdown/countdown';
import { StatusChip } from '../../race/status-chip/status-chip';
import { compactTokens } from '../../format/compact-tokens';
import type { LiveRow, ResultRow, UpcomingRow } from '../models';

/** The org's races: the live one pinned, then upcoming, then a page of results. Every row links to its race. */
@Component({
  selector: 'td-race-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HorseHead, Marquee, Countdown, StatusChip],
  templateUrl: './race-list.html',
  styleUrl: './race-list.scss',
})
export class RaceList {
  readonly live = input<LiveRow | null>(null);
  readonly upcoming = input<readonly UpcomingRow[]>([]);
  readonly results = input<readonly ResultRow[]>([]);
  protected readonly compact = (n: number | null) => (n === null ? '—' : compactTokens(n));
}
