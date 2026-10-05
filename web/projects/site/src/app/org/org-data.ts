import { Injectable, computed, inject, signal } from '@angular/core';
import type { ListOrgRacesResponse } from '@token-derby/shared';
import { ApiError, pollResource } from '@token-derby/ui';
import { RaceApi } from '../race/race-api';
import { OrgApi } from './org-api';
import { currentLive } from './org-view';

const QUICK_MS = 60_000;
const SLOW_MS = 10 * 60_000;
const SOON_MS = 60 * 60_000;

// Poll quickly while something is live or about to start, so the dashboard notices the next race.
function busy(res: ListOrgRacesResponse | undefined): boolean {
  const now = Date.now();
  return !!res?.races.some((r) => r.status === 'live' || (r.status === 'pending' && Date.parse(r.start_time) - now < SOON_MS));
}

/** One org's races, league standings and live race, shared by its dashboard and races page. Set `name` to start.
 *  Provided by OrgShell, so it (and its polling) ends when the visitor leaves the org's pages. */
@Injectable()
export class OrgData {
  readonly name = signal<string | null>(null);

  private readonly orgApi = inject(OrgApi);
  private readonly raceApi = inject(RaceApi);

  private readonly racesPoll = pollResource({
    params: () => this.name(),
    loader: (name: string) => this.orgApi.races(name),
    intervalMs: (res) => (busy(res) ? QUICK_MS : SLOW_MS),
  });
  private readonly standingsPoll = pollResource({
    params: () => this.name(),
    loader: (name: string) => this.orgApi.standings(name),
    intervalMs: SLOW_MS,
  });

  readonly races = this.racesPoll.value;
  readonly standings = computed(() => this.standingsPoll.value()?.standings ?? null);
  readonly standingsLoaded = computed(() => this.standingsPoll.value() !== undefined);
  readonly standingsFailed = computed(() => this.standingsPoll.error() !== undefined && !this.standingsLoaded());

  private readonly liveCode = computed(() => currentLive(this.races()?.races ?? [])?.join_code ?? null);
  private readonly livePoll = pollResource({
    params: () => this.liveCode(),
    loader: (code: string) => this.raceApi.race(code),
    intervalMs: QUICK_MS,
    until: (race) => race.status === 'finished',
  });
  /** The live race's full details, or null when there's none or it failed to load. */
  readonly liveRace = computed(() => {
    const race = this.livePoll.value();
    return race && race.join_code === this.liveCode() ? race : null;
  });

  readonly notFound = computed(() => {
    const e = this.racesPoll.error();
    return e instanceof ApiError && e.code === 'ORG_NOT_FOUND';
  });
  /** A failure with nothing loaded yet; once races have loaded, a later failure keeps showing them. */
  readonly racesFailed = computed(() => this.racesPoll.error() !== undefined && !this.notFound() && this.races() === undefined);
  readonly loading = computed(() => this.races() === undefined && this.racesPoll.error() === undefined);
}
