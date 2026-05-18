import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { levelFromXp } from '@token-derby/shared';
import { elapsedPct, horseXPct } from '../position.js';
import { buildHorseSvg } from '../sprite-svg.js';

const tokenFmt = new Intl.NumberFormat('en-US');

export function reconcileHorses(
  track: HTMLElement,
  race: GetRaceResponse,
  now: Date,
  paceByHorseId: ReadonlyMap<string, number | null> = new Map(),
): void {
  const visible = sortHorses(race.horses);
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

export function sortHorses(horses: readonly HorseView[]): HorseView[] {
  return horses
    .slice()
    .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
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

  const info = doc.createElement('div');
  info.className = 'horse-info';

  const nameRow = doc.createElement('div');
  nameRow.className = 'horse-name-row';

  const nameLabel = doc.createElement('span');
  nameLabel.className = 'horse-label';
  nameLabel.textContent = horse.name;
  nameRow.appendChild(nameLabel);

  const levelChip = doc.createElement('span');
  levelChip.className = 'horse-level';
  levelChip.textContent = `Lvl.${levelFromXp(horse.xp)}`;
  nameRow.appendChild(levelChip);

  info.appendChild(nameRow);

  if (horse.user_name) {
    const userLabel = doc.createElement('span');
    userLabel.className = 'user-label';
    userLabel.textContent = `(${horse.user_name})`;
    info.appendChild(userLabel);
  }

  const tokens = doc.createElement('span');
  tokens.className = 'horse-tokens';
  info.appendChild(tokens);

  const pace = doc.createElement('span');
  pace.className = 'horse-pace';
  info.appendChild(pace);

  wrap.appendChild(info);
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
  wrap.classList.toggle('live', pct > 0 && pct < 1);
  wrap.classList.toggle('pending', pct === 0);
  wrap.classList.toggle('info-front', x < 25);
  wrap.classList.toggle('info-back', x >= 25);

  const tokensEl = wrap.querySelector<HTMLElement>('.horse-tokens')!;
  tokensEl.textContent = `${tokenFmt.format(horse.current_tokens)} tok`;

  const paceEl = wrap.querySelector<HTMLElement>('.horse-pace')!;
  paceEl.textContent = pace === null ? '—' : `+${tokenFmt.format(pace)}/min`;
}
