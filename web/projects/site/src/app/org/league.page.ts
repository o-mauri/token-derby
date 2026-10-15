import { SiteVersionSwitch } from '../version/version-switch';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Button, ColumnTemplate, ColumnWindow, Crumbs, LeagueTable, Loader, NotFound, Page, SeasonPager, ThemePicker, pollResource,
} from '@token-derby/ui';
import { OrgApi } from './org-api';
import { OrgData } from './org-data';
import { leaguePageView, seasonToShow } from './org-view';

/** /org/:name/league — every division's table for a season, side by side, with the other seasons a click away. */
@Component({
  selector: 'site-org-league-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteVersionSwitch, Button, ColumnTemplate, ColumnWindow, Crumbs, LeagueTable, Loader, NotFound, Page, SeasonPager, ThemePicker, RouterLink],
  host: { 'data-page': 'org-league' },
  templateUrl: './league.page.html',
  styleUrl: './league.page.scss',
})
export class LeaguePage {
  // From ?season=N; a missing, malformed or out-of-range season shows the current one.
  readonly season = input<string | undefined>(undefined);

  protected readonly data = inject(OrgData);
  protected readonly router = inject(Router);
  private readonly api = inject(OrgApi);

  protected readonly orgName = computed(() => this.data.races()?.org_name ?? this.data.standings()?.org_name ?? '');
  private readonly current = computed(() => this.data.standings()?.season ?? null);
  private readonly shown = computed(() => {
    const current = this.current();
    return current === null ? null : seasonToShow(this.season(), current);
  });
  // Only a past season needs its own request; finished seasons don't change, so it's fetched once.
  private readonly pastSeason = pollResource({
    params: () => {
      const name = this.data.name();
      const shown = this.shown();
      return name && shown !== null && shown !== this.current() ? { name, season: shown } : null;
    },
    loader: ({ name, season }: { name: string; season: number }) => this.api.standings(name, season),
    intervalMs: 3_600_000,
    until: () => true,
  });

  protected readonly noLeague = computed(() => this.data.standingsLoaded() && this.data.standings() === null);
  protected readonly view = computed(() => {
    const current = this.current();
    if (current === null) return null;
    const standings = this.shown() === current ? this.data.standings() : this.pastSeason.value()?.standings ?? null;
    return standings ? leaguePageView(standings, current) : null;
  });
  protected readonly failed = computed(() => this.data.standingsFailed() || this.pastSeason.error() !== undefined);
  protected readonly pagerView = computed(() => {
    const current = this.current();
    const shown = this.shown();
    if (current === null || shown === null) return null;
    const link = (n: number) => ({ key: n, label: `Season ${n}` });
    return { label: `SEASON ${shown}`, prev: shown > 1 ? link(shown - 1) : null, next: shown < current ? link(shown + 1) : null };
  });
  protected readonly notFoundMessage = computed(() => ['No organisation named ', { strong: this.data.name() ?? '' }, '.']);
}
