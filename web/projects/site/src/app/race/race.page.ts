import { ChangeDetectionStrategy, Component, TemplateRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type { DialogRef } from '@angular/cdk/dialog';
import type { GetRaceResponse, GetRaceSeriesResponse } from '@token-derby/shared';
import {
  ApiError, type CountdownAnchor, Crowd, DialogFrame, DivisionResults, Finished, Loader, NotFound, Page, PendingBanner, RaceChart, RaceGraphs, RaceHeader,
  RaceTrack, SeasonStandingsTable, type SeasonView, TdDialogService, ThemePicker, Ticker, type TickerCell, TimedTab, pollResource, seasonView,
} from '@token-derby/ui';
import { RaceApi } from './race-api';
import { RaceTickerComposer, countdownAnchor, finishViews, leagueResults, raceLanes } from './race-view';

const POLL_MS = 60_000;

/** /race/:code: polls the race every minute until it finishes, then shows the results. */
@Component({
  selector: 'site-race-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Crowd, DialogFrame, DivisionResults, Finished, Loader, NotFound, Page, PendingBanner, RaceChart, RaceGraphs, RaceHeader, RaceTrack, SeasonStandingsTable, ThemePicker, Ticker, TimedTab],
  host: { 'data-page': 'race', '[attr.data-race-state]': 'race()?.status' },
  templateUrl: './race.page.html',
  styleUrl: './race.page.scss',
})
export class RacePage {
  readonly code = input.required<string>();

  private readonly api = inject(RaceApi);
  private readonly dialogs = inject(TdDialogService);
  protected readonly router = inject(Router);

  // Join codes are case-insensitive; the API stores them upper-cased.
  protected readonly joinCode = computed(() => this.code().toUpperCase());
  private readonly poll = pollResource({
    params: () => this.joinCode(),
    loader: (code: string) => this.api.race(code),
    intervalMs: POLL_MS,
    until: (r: GetRaceResponse) => r.status === 'finished',
  });
  protected readonly race = this.poll.value;
  protected readonly notFound = computed(() => {
    const err = this.poll.error();
    return !this.race() && err instanceof ApiError && err.code === 'RACE_NOT_FOUND';
  });
  protected readonly notFoundMessage = computed(() => ['No race with code ', { strong: this.joinCode() }, '.']);

  // Refreshed per snapshot, so lanes, countdown and ticker all agree on one moment.
  protected readonly now = signal(Date.now());
  protected readonly anchor = signal<CountdownAnchor | null>(null);
  protected readonly track = computed(() => {
    const race = this.race();
    return race ? raceLanes(race, new Date(this.now())) : null;
  });
  protected readonly tickerCells = signal<TickerCell[]>([]);
  protected readonly results = computed(() => {
    const race = this.race();
    return race?.status === 'finished' ? finishViews(race) : [];
  });
  protected readonly finishSeries = signal<GetRaceSeriesResponse | null>(null);
  protected readonly divisions = computed(() => {
    const r = this.race();
    return r?.status === 'finished' ? leagueResults(r) : null;
  });
  protected readonly season = signal<SeasonView | null>(null);
  private seasonRequested = false;

  protected readonly graphsSeries = signal<GetRaceSeriesResponse | null>(null);
  protected readonly graphsFailed = signal(false);
  private readonly graphsTpl = viewChild.required<TemplateRef<unknown>>('graphs');
  private graphsRef: DialogRef | null = null;
  private graphsRequest = 0;
  private finishSeriesRequested = false;
  private readonly composer = new RaceTickerComposer();

  constructor() {
    effect(() => {
      const race = this.race();
      if (race) untracked(() => this.onSnapshot(race));
    });
  }

  protected openGraphs(): void {
    if (this.graphsRef) return;
    this.graphsRef = this.dialogs.open(this.graphsTpl(), { label: 'Race graphs' });
    this.graphsRef.closed.subscribe(() => (this.graphsRef = null));
    void this.loadGraphs();
  }

  protected goOrg(): void {
    const org = this.race()?.organisation_name;
    if (org) void this.router.navigate(['/org', org]);
  }

  private onSnapshot(race: GetRaceResponse): void {
    const nowMs = Date.now();
    this.now.set(nowMs);
    this.anchor.set(countdownAnchor(race, nowMs));
    this.tickerCells.set(this.composer.update(race));
    this.loadStandings(race);
    if (race.status === 'finished') {
      // The results take over the view; a graphs dialog would be left floating over them.
      this.graphsRef?.close();
      this.loadFinishSeries();
      this.loadSeason(race);
    } else if (this.graphsRef) {
      void this.loadGraphs();
    }
  }

  // Each load supersedes the last, so a slow response can't overwrite a newer one.
  private async loadGraphs(): Promise<void> {
    const request = ++this.graphsRequest;
    try {
      const series = await this.api.series(this.joinCode());
      if (request !== this.graphsRequest) return;
      this.graphsSeries.set(series);
      this.graphsFailed.set(false);
    } catch {
      if (request === this.graphsRequest) this.graphsFailed.set(true);
    }
  }

  private loadFinishSeries(): void {
    if (this.finishSeriesRequested) return;
    this.finishSeriesRequested = true;
    this.api.series(this.joinCode()).then((s) => this.finishSeries.set(s), () => (this.finishSeriesRequested = false));
  }

  // Finishing a league race adds its points to the standings, so the finished screen fetches them afresh.
  private loadSeason(race: GetRaceResponse): void {
    const results = leagueResults(race);
    if (this.seasonRequested || !results || !race.organisation_name || race.league_season === undefined) return;
    this.seasonRequested = true;
    this.api.standings(race.organisation_name, race.league_season).then(
      (res) => res.standings && this.season.set(seasonView(res.standings, results, race.league_round ?? res.standings.round)),
      () => undefined,
    );
  }

  // League standings are the season before this fixture: fetched once, retried on a later poll if it fails.
  private loadStandings(race: GetRaceResponse): void {
    if (race.status === 'finished') return;
    const wanted = this.composer.standingsWanted(race);
    if (!wanted) return;
    this.composer.standingsRequested();
    this.api.standings(wanted.org, wanted.season).then(
      (res) => {
        this.composer.standingsLoaded(res.standings);
        const latest = this.race();
        if (latest) this.tickerCells.set(this.composer.update(latest));
      },
      () => this.composer.standingsFailed(),
    );
  }
}
