import type { GetRaceResponse, SeasonStandings } from '@token-derby/shared';
import { fetchRace, fetchOrgLeagueStandings, ApiError } from '../api.js';
import { runPollLoop } from '../poll.js';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration, predictTimeLeftSeconds, type CountdownAnchor } from '../time.js';
import { startAutoScroll } from './autoscroll.js';
import { horseFaceSvg } from '../horse-face.js';
import { createTicker, collectFreshItems, leagueOrderCells, leagueStandingsCells, type TickerCell } from './ticker.js';
import { applyCheerJitter, crowdColumns, syncSpectators, TILE_PX } from './crowd.js';
import { createRaceGraphs } from './race-graphs.js';

const POLL_INTERVAL_MS = 60_000;
const TIMER_TICK_MS = 1_000;

type RenderRaceOpts = {
  // Injectable for previews/tests; defaults to the real standings endpoint.
  fetchStandings?: (orgName: string, season: number) => Promise<{ standings: SeasonStandings | null }>;
  // Mid-race graph popup. Off by default so the org-live TV view, which has no
  // pointer, does not get a control nobody can click.
  showGraphs?: boolean;
};

export function renderRace(root: HTMLElement, joinCode: string, opts: RenderRaceOpts = {}): () => void {
  const fetchStandings = opts.fetchStandings ?? ((orgName, season) => fetchOrgLeagueStandings(orgName, season));
  root.ownerDocument.body.classList.add('tv'); // TV is the only mode
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
        <button type="button" class="btn org-btn" hidden>← Org</button>
        <button type="button" class="btn home-btn">← Home</button>
      </div>
    </header>
    <div class="crowd" aria-hidden="true">
      <div class="crowd-cap crowd-cap-left"></div>
      <div class="crowd-body"></div>
      <div class="crowd-cap crowd-cap-right"></div>
    </div>
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
    if (standings || standingsAttempted) return;
    standingsAttempted = true;
    fetchStandings(orgName, season)
      .then((res) => {
        standings = res.standings;
        // Recompose now so the standings appear without waiting a full poll.
        if (standings && lastLiveRace) composeLiveTicker(lastLiveRace);
      })
      .catch((err) => {
        standingsAttempted = false; // allow a retry on the next poll
        console.warn('[race] league standings load failed', err);
      });
  };
  const nameEl = frame.querySelector<HTMLElement>('.race-name')!;
  const statusEl = frame.querySelector<HTMLElement>('.race-status')!;
  const timeLeftEl = frame.querySelector<HTMLElement>('.race-time-left')!;
  const homeBtn = frame.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Org back-button — revealed in onSnapshot once we know the race belongs to an org.
  const orgBtn = frame.querySelector<HTMLButtonElement>('.org-btn')!;
  let orgName: string | null = null;
  orgBtn.addEventListener('click', () => {
    if (!orgName) return;
    window.history.pushState({}, '', `/org/${encodeURIComponent(orgName)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const graphs = opts.showGraphs
    ? createRaceGraphs({ doc: root.ownerDocument, joinCode })
    : null;
  if (graphs) frame.querySelector<HTMLElement>('.meta')!.prepend(graphs.button);

  const ctrl = new AbortController();
  let finishedTeardown: (() => void) | null = null;
  ctrl.signal.addEventListener('abort', () => ticker.destroy(), { once: true });
  startAutoScroll({ signal: ctrl.signal, target: track });

  const crowd = frame.querySelector<HTMLElement>('.crowd');
  const crowdBody = frame.querySelector<HTMLElement>('.crowd-body');
  if (crowd && crowdBody) {
    frame.querySelectorAll<HTMLElement>('.crowd-cap').forEach((cap) => applyCheerJitter(cap));
    const fitCrowd = () => {
      const scale = parseFloat(getComputedStyle(crowd).getPropertyValue('--sprite-scale')) || 2;
      const cols = crowdColumns(frame.clientWidth, scale);
      crowd.style.width = `${cols * scale * TILE_PX}px`;
      syncSpectators(crowdBody, Math.max(0, cols - 2)); // the two caps take a tile each
    };
    fitCrowd();
    const ro = new ResizeObserver(fitCrowd);
    ro.observe(frame);
    ctrl.signal.addEventListener('abort', () => ro.disconnect(), { once: true });
  }

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
    if (race.organisation_name) {
      orgName = race.organisation_name;
      orgBtn.textContent = `← ${race.organisation_name}`;
      orgBtn.hidden = false;
    }
    statusEl.textContent = race.status;
    statusEl.className = `race-status race-status--${race.status}`;
    graphs?.onSnapshot(race);
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
        graphs?.close(); // podium takes over the view; the popup would be buried behind it
        finishedTeardown = renderFinishedOverlay(frame, race);
        ctrl.abort(); // stop polling, ticker, autoscroll, countdown — race is over
      }
    }
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'RACE_NOT_FOUND') {
      root.innerHTML = `
        <section class="error">
          <h2>Race not found</h2>
          <p>No race with code <b>${joinCode}</b>. <a href="/">Try another code.</a></p>
        </section>
      `;
      ctrl.abort();
    }
  };

  runPollLoop({
    fetchRace: () => fetchRace(joinCode),
    intervalMs: POLL_INTERVAL_MS,
    onSnapshot,
    onError,
    abortSignal: ctrl.signal,
  });

  return () => { ctrl.abort(); finishedTeardown?.(); graphs?.destroy(); };
}
