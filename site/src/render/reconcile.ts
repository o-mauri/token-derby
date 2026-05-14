import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { elapsedPct, horseXPct } from '../position.js';
import { buildHorseSvg } from '../sprite-svg.js';

export function reconcileHorses(
  track: HTMLElement,
  race: GetRaceResponse,
  now: Date,
): void {
  const ordered = [...race.horses].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
  );
  const pct = elapsedPct(race.start_time, race.end_time, now);

  const existing = new Map<string, HTMLElement>();
  for (const lane of Array.from(track.querySelectorAll<HTMLElement>('.lane'))) {
    const id = lane.dataset.horseId;
    if (id) existing.set(id, lane);
  }

  for (let i = 0; i < ordered.length; i++) {
    const horse = ordered[i]!;
    let lane = existing.get(horse.horse_id);
    if (!lane) {
      lane = createLane(track.ownerDocument, horse);
      track.appendChild(lane);
    }
    updateLane(lane, horse, race.horses, pct);
  }
}

function createLane(doc: Document, horse: HorseView): HTMLElement {
  const lane = doc.createElement('div');
  lane.className = 'lane';
  lane.dataset.horseId = horse.horse_id;

  const wrap = doc.createElement('div');
  wrap.className = 'horse';
  wrap.dataset.horseId = horse.horse_id;
  wrap.style.setProperty('--body', horse.colors.body);
  wrap.style.setProperty('--mane', horse.colors.mane);
  wrap.style.setProperty('--tail', horse.colors.tail);
  wrap.style.setProperty('--saddle', horse.colors.saddle);

  const nameLabel = doc.createElement('span');
  nameLabel.className = 'horse-label';
  nameLabel.textContent = horse.name;
  wrap.appendChild(nameLabel);

  wrap.appendChild(buildHorseSvg(doc));
  lane.appendChild(wrap);
  return lane;
}

function updateLane(
  lane: HTMLElement,
  horse: HorseView,
  allHorses: readonly HorseView[],
  pct: number,
): void {
  const wrap = lane.querySelector<HTMLElement>('.horse')!;
  const x = horseXPct(horse, allHorses, pct);
  wrap.style.left = `${x}%`;
  wrap.classList.toggle('crashed', horse.crashed);
  wrap.classList.toggle('live', !horse.crashed && pct > 0 && pct < 1);
  wrap.classList.toggle('pending', !horse.crashed && pct === 0);
}
