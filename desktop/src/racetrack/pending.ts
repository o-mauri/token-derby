// Ported from site/src/render/pending.ts — pure DOM banner, no seam changes
// needed beyond pointing at the local time.ts copy.
import type { GetRaceResponse } from '@token-derby/shared';
import { countdownSeconds, formatDuration } from './time.js';

export function ensurePendingBanner(raceEl: HTMLElement): HTMLElement {
  let banner = raceEl.querySelector<HTMLElement>('.pending-banner');
  if (!banner) {
    banner = raceEl.ownerDocument.createElement('div');
    banner.className = 'pending-banner';
    raceEl.prepend(banner);
  }
  return banner;
}

export function updatePendingBanner(raceEl: HTMLElement, race: GetRaceResponse, now: Date): void {
  const banner = ensurePendingBanner(raceEl);
  const seconds = countdownSeconds(race.start_time, now);
  banner.textContent = seconds > 0
    ? `Race starts in ${formatDuration(seconds)}`
    : 'Starting…';
}

export function removePendingBanner(raceEl: HTMLElement): void {
  raceEl.querySelector('.pending-banner')?.remove();
}
