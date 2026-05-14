import type { GetRaceResponse } from '@token-derby/shared';
import { fetchRace, ApiError } from '../api.js';
import { runPollLoop } from '../poll.js';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration } from '../time.js';

const POLL_INTERVAL_MS = 3_000;

export function renderRace(root: HTMLElement, joinCode: string): () => void {
  root.innerHTML = '';

  const frame = root.ownerDocument.createElement('section');
  frame.className = 'race';
  frame.innerHTML = `
    <header class="race-header">
      <h1>🏇 <span class="race-name">Loading…</span></h1>
      <div class="meta">
        <span>Status: <b class="race-status">—</b></span>
        <span>Time left: <b class="race-time-left">—</b></span>
        <span>Join code: <b>${joinCode}</b></span>
      </div>
    </header>
    <div class="track"></div>
    <footer class="race-header"><div class="meta"><button type="button" class="btn home-btn">← Home</button></div></footer>
  `;
  root.appendChild(frame);

  const track = frame.querySelector<HTMLElement>('.track')!;
  const nameEl = frame.querySelector<HTMLElement>('.race-name')!;
  const statusEl = frame.querySelector<HTMLElement>('.race-status')!;
  const timeLeftEl = frame.querySelector<HTMLElement>('.race-time-left')!;
  const homeBtn = frame.querySelector<HTMLButtonElement>('.home-btn')!;
  homeBtn.addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  const ctrl = new AbortController();

  const onSnapshot = (race: GetRaceResponse) => {
    const now = new Date();
    nameEl.textContent = race.name;
    statusEl.textContent = race.status;
    statusEl.className = `race-status race-status--${race.status}`;
    timeLeftEl.textContent = formatDuration(race.time_left_seconds);

    reconcileHorses(track, race, now);

    if (race.status === 'pending') {
      updatePendingBanner(frame, race, now);
    } else {
      removePendingBanner(frame);
    }

    if (race.status === 'finished') {
      renderFinishedOverlay(frame, race);
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

  return () => ctrl.abort();
}
