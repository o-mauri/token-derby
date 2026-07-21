// Ported from site/src/render/race.ts, with its two browser seams replaced by
// injected options:
//   - data:        the site calls its own fetchRace/runPollLoop; here the
//                   caller supplies `getRace` (RaceTrack.tsx wires it to
//                   window.api.getRace) and this module drives the same
//                   fetch-then-wait poll loop (see poll-loop.ts) against it.
//   - navigation:  the site's "← Home" button does
//                   window.history.pushState('/') + a popstate dispatch to
//                   return to the site's home screen; here it calls the
//                   injected `onExit` instead (RaceTrack.tsx closes the
//                   window). This module never touches window.history.
// A third, more implicit seam inherited from the site's finished.ts: the
// end-of-race chart/season faces there fetch series/league data directly.
// Both are now optional injected hooks here (`getRaceSeries`,
// `getLeagueStandings`) threaded through to renderFinishedOverlay — omitting
// either just skips that face rather than reaching for a real fetch.
import type { GetRaceResponse, GetRaceSeriesResponse, SeasonStandings } from '@token-derby/shared';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration, predictTimeLeftSeconds, type CountdownAnchor } from './time.js';
import { startAutoScroll } from './autoscroll.js';
import { horseFaceSvg } from '../sprites/horse-face.js';
import { createTicker, collectFreshItems, leagueOrderCells, leagueStandingsCells, type TickerCell } from './ticker.js';
import { runRacePollLoop } from './poll-loop.js';

const POLL_INTERVAL_MS = 60_000;
const TIMER_TICK_MS = 1_000;

export type RenderRaceOptions = {
  joinCode: string;
  // Injected data seam — see module header.
  getRace: () => Promise<GetRaceResponse>;
  // Injected navigation seam — see module header.
  onExit: () => void;
  // Optional: powers the finished overlay's token-over-time chart faces.
  getRaceSeries?: (joinCode: string) => Promise<GetRaceSeriesResponse>;
  // Optional: powers the live league ticker + finished overlay's season face.
  // Desktop doesn't wire this up yet (no league support), so both are simply
  // absent when omitted — same as watching a non-league race.
  getLeagueStandings?: (orgName: string, season: number) => Promise<{ standings: SeasonStandings | null }>;
  // Test-only override of the 60s poll cadence.
  intervalMs?: number;
};

// Duck-typed so this module never needs to import a concrete ApiError class
// from any particular transport — any injected `getRace` can reject with a
// `{ code }`-shaped error (DesktopApiError does) and be recognised here.
function isRaceNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'RACE_NOT_FOUND'
  );
}

export function renderRace(root: HTMLElement, opts: RenderRaceOptions): () => void {
  const { joinCode, getRace, onExit, getRaceSeries, getLeagueStandings } = opts;
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;

  // Enables the autoscroll bounce behaviour (see autoscroll.ts's `tvActive`
  // check) — purely a rendering-mode flag here, no site routing implied.
  root.ownerDocument.body.classList.add('tv');
  root.innerHTML = '';

  const frame = root.ownerDocument.createElement('section');
  frame.className = 'race';
  frame.innerHTML = `
    <header class="race-header">
      <h1>${horseFaceSvg()} <span class="race-name">Loading…</span></h1>
      <div class="meta">
        <span>Status: <b class="race-status">—</b></span>
        <span>Time left: <b class="race-time-left">—</b></span>
        <span>Join code: <b>${joinCode}</b></span>
        <button type="button" class="btn home-btn">← Close</button>
      </div>
    </header>
    <div class="track"></div>
  `;
  root.appendChild(frame);

  const track = frame.querySelector<HTMLElement>('.track')!;
  const ticker = createTicker(root.ownerDocument);
  frame.appendChild(ticker.el);
  // Watermark per horse_id — only surface events with at > last shown.
  const shownAt = new Map<string, number>();
  // Achievements persist between polls (a poll with no new events keeps showing
  // the last ones); the live order is recomputed every poll.
  let lastAchievements: TickerCell[] = [];
  // Last live snapshot, kept so an async standings load can recompose the ticker
  // immediately rather than waiting for the next poll.
  let lastLiveRace: GetRaceResponse | null = null;
  // League standings are the season points BEFORE this fixture — static for the
  // race's duration, so fetch once (best-effort) and cache. `attempted` gates a
  // single in-flight request; a failed load clears it so a later poll can retry.
  let standings: SeasonStandings | null = null;
  let standingsAttempted = false;

  // Build the live ticker from the current snapshot + cached state: division order,
  // then (league only) the projected standings, then persisted achievements — each
  // behind a section gap. Runs on every poll and when standings first arrive.
  const composeLiveTicker = (race: GetRaceResponse): void => {
    const isLeague = race.league_id != null;
    const cells = leagueOrderCells(race);
    if (isLeague && standings) {
      cells.push({ kind: 'sectiongap', wide: true }, ...leagueStandingsCells(race, standings));
    }
    if (lastAchievements.length) {
      cells.push({ kind: 'sectiongap', wide: isLeague }, ...lastAchievements);
    }
    ticker.setCells(cells);
  };

  const ensureStandings = (orgName: string, season: number): void => {
    if (!getLeagueStandings || standings || standingsAttempted) return;
    standingsAttempted = true;
    getLeagueStandings(orgName, season)
      .then((res) => {
        standings = res.standings;
        // Recompose now so the standings appear without waiting a full poll.
        if (standings && lastLiveRace) composeLiveTicker(lastLiveRace);
      })
      .catch((err) => {
        standingsAttempted = false; // allow a retry on the next poll
        console.warn('[racetrack] league standings load failed', err);
      });
  };
  const nameEl = frame.querySelector<HTMLElement>('.race-name')!;
  const statusEl = frame.querySelector<HTMLElement>('.race-status')!;
  const timeLeftEl = frame.querySelector<HTMLElement>('.race-time-left')!;
  const homeBtn = frame.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    onExit();
  });

  const ctrl = new AbortController();
  let finishedTeardown: (() => void) | null = null;
  ctrl.signal.addEventListener('abort', () => ticker.destroy(), { once: true });
  startAutoScroll({ signal: ctrl.signal, target: track });

  let countdownAnchor: CountdownAnchor | null = null;
  const tickTimer = setInterval(() => {
    if (countdownAnchor) {
      timeLeftEl.textContent = formatDuration(predictTimeLeftSeconds(countdownAnchor, Date.now()));
    }
  }, TIMER_TICK_MS);
  ctrl.signal.addEventListener('abort', () => clearInterval(tickTimer), { once: true });

  const onSnapshot = (race: GetRaceResponse) => {
    const now = new Date();
    const nowMs = now.getTime();
    nameEl.textContent = race.name;
    statusEl.textContent = race.status;
    statusEl.className = `race-status race-status--${race.status}`;
    countdownAnchor = { atMs: nowMs, timeLeftSeconds: race.time_left_seconds };
    timeLeftEl.textContent = formatDuration(race.time_left_seconds);

    // Pace is computed server-side (trailing 15-min, from the series points) and
    // arrives on each horse; undefined for pending/finished → renders as '—'.
    const paceByHorseId = new Map<string, number | null>();
    for (const horse of race.horses) {
      paceByHorseId.set(horse.horse_id, horse.pace_15m ?? null);
    }

    reconcileHorses(track, race, now, paceByHorseId);

    // Live races: the order is the steady-state loop; for a league fixture the
    // projected standings follow, then fresh achievements. Non-live races have no
    // order → clear the bar.
    if (race.status === 'live') {
      lastLiveRace = race;
      const fresh = collectFreshItems(race, shownAt);
      if (fresh.length) {
        lastAchievements = fresh.flatMap((item, i): TickerCell[] =>
          i === 0 ? [{ kind: 'achievement', item }] : [{ kind: 'sep' }, { kind: 'achievement', item }],
        );
      }
      // League fixtures: kick off the one-time standings load (best-effort).
      if (race.league_id != null && race.organisation_name && race.league_season !== undefined) {
        ensureStandings(race.organisation_name, race.league_season);
      }
      composeLiveTicker(race);
    } else {
      lastLiveRace = null;
      ticker.setCells([]);
    }

    if (race.status === 'pending') {
      updatePendingBanner(frame, race, now);
    } else {
      removePendingBanner(frame);
    }

    if (race.status === 'finished') {
      if (!finishedTeardown) {
        finishedTeardown = renderFinishedOverlay(frame, race, {
          fetchSeries: getRaceSeries,
          fetchStandings: getLeagueStandings,
        });
        ctrl.abort(); // stop polling, ticker, autoscroll, countdown — race is over
      }
    }
  };

  const onError = (err: unknown) => {
    if (isRaceNotFound(err)) {
      root.innerHTML = `
        <section class="error">
          <h2>Race not found</h2>
          <p>No race with code <b>${joinCode}</b>.</p>
        </section>
      `;
      ctrl.abort();
    }
  };

  runRacePollLoop({
    fetchOne: getRace,
    intervalMs,
    onSnapshot,
    onError,
    abortSignal: ctrl.signal,
  });

  return () => { ctrl.abort(); finishedTeardown?.(); };
}
