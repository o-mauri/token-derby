import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { levelFromXp, hatById } from '@token-derby/shared';
import { elapsedPct, horseXPct } from '../position.js';
import { buildHorseSvg } from '../sprite-svg.js';
import { buildHatGroup } from '../hat-svg.js';

const tokenFmt = new Intl.NumberFormat('en-US');

// 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th", 21 → "21st" …
function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

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
      lane = createLane(track.ownerDocument, horse, race.league_id != null);
    }
    track.appendChild(lane);
    updateLane(
      lane,
      horse,
      race.horses,
      pct,
      paceByHorseId.get(horse.horse_id) ?? null,
      race.league_division_names,
    );
  }
}

export function sortHorses(horses: readonly HorseView[]): HorseView[] {
  return horses
    .slice()
    .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
}

function createLane(doc: Document, horse: HorseView, isLeague: boolean): HTMLElement {
  const lane = doc.createElement('div');
  lane.className = 'lane';
  lane.dataset.horseId = horse.horse_id;

  // ── Fixed name-tag at the start of the lane ──
  // Each row clips to the (narrow) tag width; .row-scroll marquees its content
  // when it overflows (see updateLane). The tag is a bordered chip aligned with
  // the horse's vertical middle.
  const info = doc.createElement('div');
  info.className = 'lane-info';

  const box = doc.createElement('div');
  box.className = 'lane-info-box';

  // ── Row 1: the horse name, on its own ──
  const nameRow = doc.createElement('div');
  nameRow.className = 'horse-name-row';
  const nameScroll = doc.createElement('div');
  nameScroll.className = 'row-scroll';
  const nameLabel = doc.createElement('span');
  nameLabel.className = 'horse-label';
  nameLabel.textContent = horse.name;
  nameScroll.appendChild(nameLabel);
  nameRow.appendChild(nameScroll);
  box.appendChild(nameRow);

  // ── Row 2: total tokens, always visible (pulled out of the rotation) ──
  const tokensRow = doc.createElement('div');
  tokensRow.className = 'horse-tokens-row';
  const tokensScroll = doc.createElement('div');
  tokensScroll.className = 'row-scroll';
  const tokens = doc.createElement('span');
  tokens.className = 'horse-tokens';
  tokensScroll.appendChild(tokens);
  tokensRow.appendChild(tokensScroll);
  box.appendChild(tokensRow);

  // ── Row 3: rotator that flips between owner / level / pace / position ──
  const statsRow = doc.createElement('div');
  statsRow.className = 'horse-stats-row';
  if (isLeague) statsRow.classList.add('is-league');
  const makeView = (): HTMLElement => {
    const view = doc.createElement('div');
    view.className = 'stat-view';
    const scroll = doc.createElement('div');
    scroll.className = 'row-scroll';
    view.appendChild(scroll);
    statsRow.appendChild(view);
    return scroll;
  };

  // View 1 — owner name (view kept even for legacy horses so cycle timing holds)
  const ownerView = makeView();
  if (horse.user_name) {
    const userLabel = doc.createElement('span');
    userLabel.className = 'user-label';
    userLabel.textContent = horse.user_name;
    ownerView.appendChild(userLabel);
  }

  // View 2 — level chip
  const levelChip = doc.createElement('span');
  levelChip.className = 'horse-level';
  levelChip.textContent = `Lvl. ${levelFromXp(horse.xp + (horse.live_xp ?? 0))}`;
  makeView().appendChild(levelChip);

  // View 3 — token pace
  const pace = doc.createElement('span');
  pace.className = 'horse-pace';
  makeView().appendChild(pace);

  // View 4 — current race position
  const position = doc.createElement('span');
  position.className = 'horse-position';
  makeView().appendChild(position);

  // View 5 — live league position within the horse's division (league fixtures only)
  if (isLeague) {
    const leaguePos = doc.createElement('span');
    leaguePos.className = 'horse-league-pos';
    makeView().appendChild(leaguePos);
  }

  box.appendChild(statsRow);
  info.appendChild(box);
  lane.appendChild(info);

  // ── Running strip (dirt + rails) to the right of the labels ──
  const trackStrip = doc.createElement('div');
  trackStrip.className = 'lane-track';

  const wrap = doc.createElement('div');
  wrap.className = 'horse';
  wrap.dataset.horseId = horse.horse_id;
  wrap.style.setProperty('--body', horse.colors.body);
  wrap.style.setProperty('--mane', horse.colors.mane);
  wrap.style.setProperty('--tail', horse.colors.tail);
  wrap.style.setProperty('--saddle', horse.colors.saddle);

  const dust = doc.createElement('span');
  dust.className = 'horse-dust';
  wrap.appendChild(dust);

  const horseSvg = buildHorseSvg(doc);
  if (horse.equipped_hat) {
    const hat = hatById(horse.equipped_hat.id);
    if (hat) {
      horseSvg.appendChild(buildHatGroup(doc, hat, horse.equipped_hat.variant ?? 0));
    }
  }
  wrap.appendChild(horseSvg);

  trackStrip.appendChild(wrap);
  lane.appendChild(trackStrip);
  return lane;
}

function updateLane(
  lane: HTMLElement,
  horse: HorseView,
  allHorses: readonly HorseView[],
  pct: number,
  pace: number | null,
  leagueDivisionNames?: string[],
): void {
  const wrap = lane.querySelector<HTMLElement>('.horse')!;
  const x = horseXPct(horse, allHorses, pct);
  wrap.style.left = `${x}%`;
  wrap.classList.toggle('live', pct > 0 && pct < 1);
  wrap.classList.toggle('pending', pct === 0);

  // Labels live in the fixed lane-info column, not on the moving horse.
  const tokensEl = lane.querySelector<HTMLElement>('.horse-tokens')!;
  tokensEl.textContent = `${tokenFmt.format(horse.current_tokens)} tok`;

  const paceEl = lane.querySelector<HTMLElement>('.horse-pace')!;
  paceEl.textContent = pace === null ? '—' : `+${tokenFmt.format(pace)}/min`;

  const levelEl = lane.querySelector<HTMLElement>('.horse-level');
  if (levelEl) {
    levelEl.textContent = `Lvl. ${levelFromXp(horse.xp + (horse.live_xp ?? 0))}`;
  }

  // Race position by tokens (competition ranking: ties share a place).
  const posEl = lane.querySelector<HTMLElement>('.horse-position');
  if (posEl) {
    const rank = 1 + allHorses.filter((h) => h.current_tokens > horse.current_tokens).length;
    posEl.textContent = ordinal(rank);
    posEl.className = 'horse-position' + (rank <= 3 ? ` pos-${rank}` : '');
  }

  // Live position within the horse's own division (league fixtures only).
  const lpEl = lane.querySelector<HTMLElement>('.horse-league-pos');
  if (lpEl && horse.division !== undefined && leagueDivisionNames) {
    const inDiv = allHorses.filter((h) => h.division === horse.division);
    const rank = 1 + inDiv.filter((h) => h.current_tokens > horse.current_tokens).length;
    const name = leagueDivisionNames[horse.division - 1] ?? `Div ${horse.division}`;
    lpEl.textContent = `${ordinal(rank)} (${name})`;
  }

  // Marquee any row whose content overflows the narrow name-tag: pause at the
  // start, scroll through the whole thing, scroll back (see .row-scroll CSS).
  for (const scroll of Array.from(lane.querySelectorAll<HTMLElement>('.row-scroll'))) {
    const row = scroll.parentElement;
    if (!row) continue;
    const overflow = scroll.scrollWidth - row.clientWidth;
    if (overflow > 1) {
      scroll.style.setProperty('--shift', `${-overflow}px`);
      scroll.classList.add('is-scrolling');
    } else {
      scroll.classList.remove('is-scrolling');
      scroll.style.removeProperty('--shift');
    }
  }
}
