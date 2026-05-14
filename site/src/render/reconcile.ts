import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { elapsedPct, horseXPct } from '../position.js';
import { buildHorseSvg } from '../sprite-svg.js';

const tokenFmt = new Intl.NumberFormat('en-US');

export function reconcileHorses(
  track: HTMLElement,
  race: GetRaceResponse,
  now: Date,
  paceByHorseId: ReadonlyMap<string, number | null> = new Map(),
): void {
  const visible = filterAndSortHorses(race.horses);
  const visibleIds = new Set(visible.map((h) => h.horse_id));
  const pct = elapsedPct(race.start_time, race.end_time, now);

  const existing = new Map<string, HTMLElement>();
  for (const lane of Array.from(track.querySelectorAll<HTMLElement>('.lane'))) {
    const id = lane.dataset.horseId;
    if (id) existing.set(id, lane);
  }

  for (const [id, lane] of existing) {
    if (!visibleIds.has(id)) lane.remove();
  }

  for (const horse of visible) {
    let lane = existing.get(horse.horse_id);
    if (!lane) {
      lane = createLane(track.ownerDocument, horse);
    }
    track.appendChild(lane);
    updateLane(lane, horse, race.horses, pct, paceByHorseId.get(horse.horse_id) ?? null);
  }
}

export function filterAndSortHorses(horses: readonly HorseView[]): HorseView[] {
  const liveNames = new Set<string>();
  for (const h of horses) {
    if (!h.crashed) liveNames.add(h.name);
  }
  const visible = horses.filter((h) => !(h.crashed && liveNames.has(h.name)));

  return visible.slice().sort((a, b) => {
    if (a.crashed !== b.crashed) return a.crashed ? 1 : -1;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
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

  const tokens = doc.createElement('span');
  tokens.className = 'horse-tokens';
  wrap.appendChild(tokens);

  const pace = doc.createElement('span');
  pace.className = 'horse-pace';
  wrap.appendChild(pace);

  wrap.appendChild(buildHorseSvg(doc));
  lane.appendChild(wrap);
  return lane;
}

function updateLane(
  lane: HTMLElement,
  horse: HorseView,
  allHorses: readonly HorseView[],
  pct: number,
  pace: number | null,
): void {
  const wrap = lane.querySelector<HTMLElement>('.horse')!;
  const x = horseXPct(horse, allHorses, pct);
  wrap.style.left = `${x}%`;
  wrap.classList.toggle('crashed', horse.crashed);
  wrap.classList.toggle('live', !horse.crashed && pct > 0 && pct < 1);
  wrap.classList.toggle('pending', !horse.crashed && pct === 0);

  const tokensEl = wrap.querySelector<HTMLElement>('.horse-tokens')!;
  tokensEl.textContent = `${tokenFmt.format(horse.current_tokens)} tok`;

  const paceEl = wrap.querySelector<HTMLElement>('.horse-pace')!;
  paceEl.textContent = pace === null ? '—' : `+${tokenFmt.format(pace)}/min`;
}
