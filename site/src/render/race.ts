import type { GetRaceResponse } from '@token-derby/shared';
import { fetchRace, ApiError } from '../api.js';
import { runPollLoop } from '../poll.js';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration, predictTimeLeftSeconds, type CountdownAnchor } from '../time.js';
import { startAutoScroll } from './autoscroll.js';
import { horseFaceSvg } from '../horse-face.js';
import { createTicker, collectFreshItems } from './ticker.js';

const POLL_INTERVAL_MS = 60_000;
const TIMER_TICK_MS = 1_000;

export function renderRace(root: HTMLElement, joinCode: string): () => void {
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
  const nameEl = frame.querySelector<HTMLElement>('.race-name')!;
  const statusEl = frame.querySelector<HTMLElement>('.race-status')!;
  const timeLeftEl = frame.querySelector<HTMLElement>('.race-time-left')!;
  const homeBtn = frame.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });


  const ctrl = new AbortController();
  let finishedTeardown: (() => void) | null = null;
  ctrl.signal.addEventListener('abort', () => ticker.destroy(), { once: true });
  startAutoScroll({ signal: ctrl.signal, target: track });

  const crowd = frame.querySelector<HTMLElement>('.crowd');
  if (crowd) {
    const fitCrowd = () => {
      const scale = parseFloat(getComputedStyle(crowd).getPropertyValue('--sprite-scale')) || 2;
      const tile = scale * 32;
      const w = Math.floor(frame.clientWidth / tile) * tile;
      crowd.style.width = `${w}px`;
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

    // Feed this tick's new achievements into the rolling ticker. An empty
    // batch leaves the previous batch looping rather than blanking the bar.
    ticker.setBatch(collectFreshItems(race, shownAt));

    if (race.status === 'pending') {
      updatePendingBanner(frame, race, now);
    } else {
      removePendingBanner(frame);
    }

    if (race.status === 'finished') {
      if (!finishedTeardown) {
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

  return () => { ctrl.abort(); finishedTeardown?.(); };
}
