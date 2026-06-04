import type { RaceSummary } from '@token-derby/shared';
import { fetchOrgRaces, ApiError } from '../api.js';
import { renderRace } from './race.js';

// How often we re-resolve which race the TV should be showing. The embedded
// race view does its own data polling; this loop only watches for the *pick*
// changing (a new race going live, or the live one being replaced).
const RESOLVE_INTERVAL_MS = 60_000;

// "Set and forget" view for an org: always shows the current live race, or
// failing that the most recently run one, swapping automatically as races
// start. Meant to be left open on an office TV.
export function renderOrgLive(root: HTMLElement, orgName: string): () => void {
  root.innerHTML = `<p class="org-status">Loading…</p>`;

  let disposed = false;
  let innerCleanup: (() => void) | null = null;
  let shownJoinCode: string | null = null;

  const resolve = async () => {
    let races: RaceSummary[];
    try {
      races = (await fetchOrgRaces(orgName)).races;
    } catch (err: unknown) {
      if (disposed || shownJoinCode) return; // keep the current race on transient errors
      if (err instanceof ApiError && err.code === 'ORG_NOT_FOUND') {
        root.innerHTML = `<p class="org-status">No organisation named <b>${escapeHtml(orgName)}</b>.</p>`;
      } else {
        root.innerHTML = `<p class="org-status">Couldn't load races. Retrying…</p>`;
      }
      return;
    }
    if (disposed) return;

    const pick = pickLiveOrLastRace(races);
    if (!pick) {
      if (!shownJoinCode) {
        root.innerHTML = `<p class="org-status">No races yet for <b>${escapeHtml(orgName)}</b>.</p>`;
      }
      return;
    }
    if (pick.join_code === shownJoinCode) return;

    innerCleanup?.();
    shownJoinCode = pick.join_code;
    innerCleanup = renderRace(root, pick.join_code);
  };

  void resolve();
  const interval = setInterval(() => void resolve(), RESOLVE_INTERVAL_MS);

  return () => {
    disposed = true;
    clearInterval(interval);
    innerCleanup?.();
  };
}

// Pick priority: the live race (most recently started, if several) → the most
// recently started finished race → the next upcoming race (its pending banner
// shows a start countdown) → nothing.
export function pickLiveOrLastRace(races: RaceSummary[]): RaceSummary | null {
  const startMs = (r: RaceSummary) => new Date(r.start_time).getTime();

  const live = races
    .filter((r) => r.status === 'live')
    .sort((a, b) => startMs(b) - startMs(a));
  if (live[0]) return live[0];

  const finished = races
    .filter((r) => r.status === 'finished')
    .sort((a, b) => startMs(b) - startMs(a));
  if (finished[0]) return finished[0];

  const pending = races
    .filter((r) => r.status === 'pending')
    .sort((a, b) => startMs(a) - startMs(b));
  return pending[0] ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
