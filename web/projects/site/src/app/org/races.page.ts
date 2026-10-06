import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button, Crumbs, Loader, MonthPager, NotFound, Page, RaceList, ThemePicker } from '@token-derby/ui';
import { OrgData } from './org-data';
import { liveRow, monthPage, upcomingRows } from './org-view';

/** /org/:name/races — the live and upcoming races, then results a month at a time. */
@Component({
  selector: 'site-org-races-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Crumbs, Loader, MonthPager, NotFound, Page, RaceList, ThemePicker, RouterLink],
  host: { 'data-page': 'org-races' },
  templateUrl: './races.page.html',
  styleUrl: './races.page.scss',
})
export class RacesPage {
  // From ?month=YYYY-MM; a missing or unknown month shows the latest.
  readonly month = input<string | undefined>(undefined);

  protected readonly data = inject(OrgData);
  protected readonly router = inject(Router);

  protected readonly races = computed(() => this.data.races()?.races ?? []);
  protected readonly orgName = computed(() => this.data.races()?.org_name ?? '');
  protected readonly live = computed(() => liveRow(this.races(), Date.now()));
  protected readonly upcoming = computed(() => upcomingRows(this.races(), Date.now()));
  protected readonly page = computed(() => monthPage(this.races(), this.month() ?? null));
  protected readonly notFoundMessage = computed(() => ['No organisation named ', { strong: this.data.name() ?? '' }, '.']);
}
