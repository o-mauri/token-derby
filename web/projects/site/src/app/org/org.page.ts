import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  Button, Crumbs, LeaguePanel, LivePanel, Loader, NotFound, Page, Panel, RacesPanel, StatsPanel, ThemePicker,
} from '@token-derby/ui';
import { OrgData } from './org-data';
import { leaguePanelView, livePanelView, racesPanelView, statsPanelView } from './org-view';

/** /org/:name — the org's dashboard: the live race, league, stats and recent races on one screen. */
@Component({
  selector: 'site-org-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Crumbs, LeaguePanel, LivePanel, Loader, NotFound, Page, Panel, RacesPanel, StatsPanel, ThemePicker, RouterLink],
  host: { 'data-page': 'org' },
  templateUrl: './org.page.html',
  styleUrl: './org.page.scss',
})
export class OrgPage {
  protected readonly data = inject(OrgData);
  protected readonly router = inject(Router);

  private readonly races = computed(() => this.data.races()?.races ?? []);
  protected readonly orgName = computed(() => this.data.races()?.org_name ?? '');
  protected readonly live = computed(() => livePanelView(this.races(), this.data.liveRace(), Date.now()));
  protected readonly liveLink = computed(() => {
    const v = this.live();
    return v.kind === 'none' ? null : ['/race', v.code];
  });
  protected readonly league = computed(() => leaguePanelView(this.data.standings()));
  protected readonly stats = computed(() => statsPanelView(this.races()));
  protected readonly recent = computed(() => racesPanelView(this.races(), Date.now()));
  protected readonly notFoundMessage = computed(() => ['No organisation named ', { strong: this.data.name() ?? '' }, '.']);
}
