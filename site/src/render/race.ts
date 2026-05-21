import type { GetRaceResponse } from '@token-derby/shared';
import { ACHIEVEMENT_DESCRIPTIONS, overtakeDescription, type RecentEvent } from '@token-derby/shared';
import { fetchRace, ApiError } from '../api.js';
import { runPollLoop } from '../poll.js';
import { reconcileHorses } from './reconcile.js';
import { updatePendingBanner, removePendingBanner } from './pending.js';
import { renderFinishedOverlay } from './finished.js';
import { formatDuration, predictTimeLeftSeconds, type CountdownAnchor } from '../time.js';
import { appendSample, trimWindow, computePace, type Sample } from './pace.js';
import { startAutoScroll } from './autoscroll.js';
import { horseFaceSvg } from '../horse-face.js';
import { renderAchievementToast } from './toast.js';

const POLL_INTERVAL_MS = 60_000;
const TIMER_TICK_MS = 1_000;

export function renderRace(root: HTMLElement, joinCode: string): () => void {
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
      </div>
    </header>
    <div class="crowd" aria-hidden="true">
      <div class="crowd-cap crowd-cap-left"></div>
      <div class="crowd-body"></div>
      <div class="crowd-cap crowd-cap-right"></div>
    </div>
    <div class="track"></div>
    <footer class="race-header"><div class="meta"><button type="button" class="btn home-btn">← Home</button></div></footer>
  `;
  root.appendChild(frame);

  const track = frame.querySelector<HTMLElement>('.track')!;
  const toastContainer = root.ownerDocument.createElement('div');
  toastContainer.className = 'achievement-toast-container';
  frame.appendChild(toastContainer);
  // Watermark per horse_id — only show events with at > last shown.
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
  const buffers = new Map<string, Sample[]>();
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

    const paceByHorseId = new Map<string, number | null>();
    if (race.status !== 'finished') {
      const seen = new Set<string>();
      for (const horse of race.horses) {
        seen.add(horse.horse_id);
        const prev = buffers.get(horse.horse_id) ?? [];
        const next = trimWindow(appendSample(prev, nowMs, horse.current_tokens), nowMs);
        buffers.set(horse.horse_id, next);
        paceByHorseId.set(horse.horse_id, computePace(next));
      }
      for (const id of Array.from(buffers.keys())) {
        if (!seen.has(id)) buffers.delete(id);
      }
    } else {
      for (const horse of race.horses) {
        paceByHorseId.set(horse.horse_id, computePace(buffers.get(horse.horse_id) ?? []));
      }
    }

    reconcileHorses(track, race, now, paceByHorseId);

    // Surface achievement toasts for any horse that has new recent_events.
    for (const horse of race.horses) {
      const watermark = shownAt.get(horse.horse_id) ?? 0;
      const fresh = (horse.recent_events ?? []).filter(e => e.at > watermark);
      if (fresh.length === 0) continue;
      shownAt.set(horse.horse_id, Math.max(...fresh.map(e => e.at)));
      for (const ev of fresh) {
        showToast(root.ownerDocument, toastContainer, horse.name, ev);
      }
    }

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

function showToast(doc: Document, container: HTMLElement, horseName: string, event: RecentEvent): void {
  const node = renderAchievementToast(doc, {
    horseName,
    name: event.name,
    description: event.name === 'Overtake!'
      ? overtakeDescription(Math.floor(event.xp / 3))
      : ACHIEVEMENT_DESCRIPTIONS[event.name],
    xp: event.xp,
  });
  const offset = container.querySelectorAll<HTMLElement>('.achievement-toast').length;
  node.style.bottom = `${1 + offset * 5}rem`;
  container.appendChild(node);
  setTimeout(() => {
    if (node.parentNode === container) container.removeChild(node);
  }, 10_000);
}
