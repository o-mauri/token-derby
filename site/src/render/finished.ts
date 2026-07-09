import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, SeasonStandings } from '@token-derby/shared';
import { levelInfo, levelFromXp } from '@token-derby/shared';
import { fetchRaceSeries, fetchOrgLeagueStandings } from '../api.js';
import { buildChartFaces } from './race-chart.js';
import { renderLeagueStandings } from './league-standings.js';
import { startCycler, type Cycler } from './panel-cycler.js';

const CONFETTI_COLORS = ['#ffd166', '#7bed9f', '#a68bd8', '#ff6b6b', '#4db8ff', '#ffffff'];
const CONFETTI_COUNT = 40;
const FLIP_INTERVAL_MS = 8_000;

type FinishedOptions = {
  fetchSeries?: (joinCode: string) => Promise<GetRaceSeriesResponse>;
  fetchStandings?: (orgName: string, season: number) => Promise<{ standings: SeasonStandings | null }>;
  win?: Window;
  intervalMs?: number;
};

export function renderFinishedOverlay(
  raceEl: HTMLElement,
  race: GetRaceResponse,
  opts: FinishedOptions = {},
): () => void {
  if (raceEl.querySelector('.podium')) return () => {};

  raceEl.classList.add('finished');
  raceEl.appendChild(buildConfetti(raceEl.ownerDocument));

  const ctrl = new AbortController();
  const overlay = buildPodium(raceEl.ownerDocument, race, ctrl);
  raceEl.appendChild(overlay);

  void mountDetailCycle(overlay, race, ctrl.signal, opts);

  return () => ctrl.abort();
}

function buildConfetti(doc: Document): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'confetti';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = doc.createElement('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
    piece.style.animationDelay = `${(Math.random() * 2).toFixed(2)}s`;
    piece.style.transform = `rotate(${Math.floor(Math.random() * 360)}deg)`;
    wrap.appendChild(piece);
  }
  return wrap;
}

function buildPodium(doc: Document, race: GetRaceResponse, ctrl: AbortController): HTMLElement {
  const sorted = [...race.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top: HorseView[] = sorted.slice(0, 3);
  const rest: HorseView[] = sorted.slice(3);

  const overlay = doc.createElement('div');
  overlay.className = 'podium';

  const heading = doc.createElement('h2');
  heading.textContent = '🏆 Final Standings';
  overlay.appendChild(heading);

  if (top.length > 0) {
    const list = doc.createElement('ol');
    top.forEach((h, i) => list.appendChild(buildPodiumCard(doc, h, i)));
    overlay.appendChild(list);
  }

  // Rotating detail panel: standings is face 1; charts are appended later.
  const cycle = doc.createElement('div');
  cycle.className = 'detail-cycle';
  if (rest.length > 0) {
    const standings = buildStandingsTable(doc, rest);
    standings.classList.add('detail-face');
    cycle.appendChild(standings);
  }
  overlay.appendChild(cycle);

  const dismissBtn = doc.createElement('button');
  dismissBtn.className = 'dismiss';
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => { overlay.remove(); ctrl.abort(); });
  overlay.appendChild(dismissBtn);

  scheduleBarAnimation(overlay);

  return overlay;
}

function buildPodiumCard(doc: Document, horse: HorseView, idx: number): HTMLElement {
  const xpBefore = horse.xp;
  const xpAwarded = horse.xp_awarded ?? 0;
  const xpAfter = xpBefore + xpAwarded;
  const before = levelInfo(xpBefore);
  const after = levelInfo(xpAfter);
  const levelledUp = after.level > before.level;
  // Same level → animate from old % to new %.
  // Levelled up → start at 0 within the new level (the "fill the old bar" beat is
  // implicitly conveyed by the LEVEL UP banner).
  const startPct = levelledUp ? 0 : before.progress;
  const endPct = after.progress;

  const li = doc.createElement('li');

  const place = doc.createElement('span');
  place.className = 'place';
  place.textContent = ['🥇', '🥈', '🥉'][idx]!;
  li.appendChild(place);

  const name = doc.createElement('div');
  name.className = 'name';
  name.textContent = horse.name;
  li.appendChild(name);

  if (horse.user_name) {
    const user = doc.createElement('div');
    user.className = 'podium-user';
    user.textContent = `(${horse.user_name})`;
    li.appendChild(user);
  }

  const tokens = doc.createElement('div');
  tokens.className = 'tokens';
  tokens.textContent = `${(horse.final_tokens ?? horse.current_tokens).toLocaleString()} tokens`;
  li.appendChild(tokens);

  const xpLine = doc.createElement('div');
  xpLine.className = 'xp-line';
  const chip = doc.createElement('span');
  chip.className = 'level-chip';
  chip.textContent = `Lvl. ${after.level}`;
  xpLine.appendChild(chip);
  if (xpAwarded > 0) {
    const gained = doc.createElement('span');
    gained.className = 'xp-gained';
    gained.textContent = `+${xpAwarded} XP`;
    xpLine.appendChild(gained);
    const liveXp = horse.live_xp ?? 0;
    if (liveXp > 0) {
      const fromAch = doc.createElement('span');
      fromAch.className = 'xp-from-achievements';
      fromAch.textContent = ` (+${liveXp} from achievements)`;
      xpLine.appendChild(fromAch);
    }
  }
  li.appendChild(xpLine);

  const bar = doc.createElement('div');
  bar.className = 'xp-bar';
  const fill = doc.createElement('div');
  fill.className = 'xp-bar-fill';
  fill.style.width = `${(startPct * 100).toFixed(2)}%`;
  fill.dataset.targetPct = (endPct * 100).toFixed(2);
  bar.appendChild(fill);
  li.appendChild(bar);

  const barText = doc.createElement('div');
  barText.className = 'xp-bar-text';
  if (after.next_level_xp === null) {
    barText.textContent = `${after.xp} XP (max level)`;
  } else {
    barText.textContent = `${after.xp_into_level} / ${after.xp_for_level} XP`;
  }
  li.appendChild(barText);

  if (levelledUp) {
    const banner = doc.createElement('div');
    banner.className = 'level-up-banner';
    banner.textContent = 'LEVEL UP!';
    li.appendChild(banner);
  }

  return li;
}

function buildStandingsTable(doc: Document, horses: HorseView[]): HTMLElement {
  const table = doc.createElement('table');
  table.className = 'standings-table';

  const thead = doc.createElement('thead');
  thead.innerHTML = '<tr><th>Rank</th><th>Horse</th><th>Tokens</th><th>XP</th><th>Level</th></tr>';
  table.appendChild(thead);

  const tbody = doc.createElement('tbody');
  for (const h of horses) {
    const xpBefore = h.xp;
    const xpAwarded = h.xp_awarded ?? 0;
    const xpAfter = xpBefore + xpAwarded;
    const lvlBefore = levelFromXp(xpBefore);
    const lvlAfter = levelFromXp(xpAfter);
    const levelledUp = lvlAfter > lvlBefore;

    const tr = doc.createElement('tr');
    appendCell(doc, tr, String(h.rank ?? '—'), 'rank');
    tr.appendChild(buildHorseCell(doc, h));
    appendCell(doc, tr, (h.final_tokens ?? h.current_tokens).toLocaleString());
    const liveXp = h.live_xp ?? 0;
    const xpText = xpAwarded > 0 ? `+${xpAwarded}${liveXp > 0 ? ` (+${liveXp} from achievements)` : ''}` : '0';
    appendCell(doc, tr, xpText);
    appendCell(
      doc, tr,
      levelledUp ? `Lvl. ${lvlBefore} → ${lvlAfter}` : `Lvl. ${lvlAfter}`,
      levelledUp ? 'levelled-up' : undefined,
    );
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function appendCell(doc: Document, tr: HTMLTableRowElement, text: string, cls?: string): void {
  const td = doc.createElement('td');
  td.textContent = text;
  if (cls) td.className = cls;
  tr.appendChild(td);
}

function buildHorseCell(doc: Document, h: HorseView): HTMLTableCellElement {
  const td = doc.createElement('td');
  td.className = 'horse-name';
  td.appendChild(doc.createTextNode(h.name));
  if (h.user_name) {
    const jockey = doc.createElement('span');
    jockey.className = 'jockey';
    jockey.textContent = ` (${h.user_name})`;
    td.appendChild(jockey);
  }
  return td;
}

function scheduleBarAnimation(overlay: HTMLElement): void {
  // jsdom (used in tests) doesn't support requestAnimationFrame in the same way
  // as browsers — fall back to a microtask so the test environment still sees
  // the target width applied.
  const fills = overlay.querySelectorAll<HTMLElement>('.xp-bar-fill');
  const apply = () => {
    fills.forEach(fill => {
      const target = fill.dataset.targetPct;
      if (target !== undefined) fill.style.width = `${target}%`;
    });
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(apply));
  } else {
    queueMicrotask(apply);
  }
}

async function mountDetailCycle(
  overlay: HTMLElement,
  race: GetRaceResponse,
  signal: AbortSignal,
  opts: FinishedOptions,
): Promise<void> {
  const cycle = overlay.querySelector<HTMLElement>('.detail-cycle');
  if (!cycle) return;
  const fetchSeries = opts.fetchSeries ?? fetchRaceSeries;
  const win = opts.win ?? window;
  try {
    const series = await fetchSeries(race.join_code);
    if (signal.aborted) return;
    for (const face of buildChartFaces(overlay.ownerDocument, series, race.horses)) {
      cycle.appendChild(face);
    }
  } catch (err) {
    // Series fetch/render failed — leave the standings face static.
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
      console.warn('[finished] series load failed', err);
    }
  }
  if (race.league_id && race.league_season !== undefined && race.organisation_name) {
    try {
      const getStandings = opts.fetchStandings ?? fetchOrgLeagueStandings;
      const { standings } = await getStandings(race.organisation_name, race.league_season);
      if (!signal.aborted && standings && standings.divisions.length > 0) {
        const face = buildSeasonFace(overlay.ownerDocument, standings, race.league_round);
        cycle.appendChild(face);
      }
    } catch (err) {
      // Best-effort: skip the season face, leave the rest of the end screen intact.
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
        console.warn('[finished] league standings load failed', err);
      }
    }
  }
  if (signal.aborted) return;
  const faces = [...cycle.querySelectorAll<HTMLElement>('.detail-face')];
  if (faces.length === 0) return;

  const doc = overlay.ownerDocument;
  const multi = faces.length > 1;

  // Page dots + prev/next nav, so the viewer can step through faces instead of
  // waiting for the auto-advance. Built before startCycler so its initial
  // onChange(0) finds the dots. Only shown when there's more than one face.
  const dots: HTMLButtonElement[] = [];
  let cycler: Cycler;
  const onChange = (index: number) => {
    dots.forEach((d, i) => {
      const isActive = i === index;
      d.classList.toggle('is-active', isActive);
      if (isActive) d.setAttribute('aria-current', 'true');
      else d.removeAttribute('aria-current');
    });
  };

  if (multi) {
    const nav = doc.createElement('div');
    nav.className = 'detail-nav';
    nav.appendChild(navButton(doc, '‹', 'Previous', () => cycler.prev()));
    const dotsWrap = doc.createElement('div');
    dotsWrap.className = 'facedots';
    faces.forEach((_, i) => {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'facedot';
      dot.setAttribute('aria-label', `Go to page ${i + 1}`);
      dot.addEventListener('click', () => cycler.goTo(i));
      dots.push(dot);
      dotsWrap.appendChild(dot);
    });
    nav.appendChild(dotsWrap);
    nav.appendChild(navButton(doc, '›', 'Next', () => cycler.next()));
    cycle.insertAdjacentElement('afterend', nav);
  }

  cycler = startCycler({
    panels: faces,
    intervalMs: opts.intervalMs ?? FLIP_INTERVAL_MS,
    win,
    onChange: multi ? onChange : undefined,
  });
  signal.addEventListener('abort', () => cycler.destroy(), { once: true });
}

function navButton(
  doc: Document, glyph: string, label: string, onClick: () => void,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'detail-nav-btn';
  b.setAttribute('aria-label', label);
  b.textContent = glyph;
  b.addEventListener('click', onClick);
  return b;
}

// The season-standings end-screen face. On the season finale (this race is the
// final fixture) it heads with "Final" and crowns the champion — the leader of
// the highest populated flight — derived straight from the standings.
function buildSeasonFace(doc: Document, standings: SeasonStandings, round: number | undefined): HTMLElement {
  const face = doc.createElement('div');
  face.className = 'detail-face season-face';

  const isFinale = round !== undefined && round === standings.races_per_season;

  const header = doc.createElement('div');
  header.className = 'season-face-head';
  header.textContent = isFinale
    ? `Season ${standings.season} · Final`
    : `Season ${standings.season} · Round ${standings.round}/${standings.races_per_season}`;
  face.appendChild(header);

  if (isFinale) {
    // Champion = leader of the highest populated flight (division 1 in steady
    // state; the pool winner in season 1).
    const topDiv = standings.divisions.find((d) => d.rows.length > 0);
    const champ = topDiv?.rows[0];
    if (champ) {
      const banner = doc.createElement('div');
      banner.className = 'season-champion';
      const trophy = doc.createElement('span');
      trophy.className = 'season-champion-trophy';
      trophy.textContent = '🏆';
      banner.appendChild(trophy);
      const text = doc.createElement('div');
      const label = doc.createElement('div');
      label.className = 'season-champion-label';
      label.textContent = `Season ${standings.season} Champion`;
      const nameEl = doc.createElement('div');
      nameEl.className = 'season-champion-name';
      nameEl.appendChild(doc.createTextNode(`${champ.horse_name} `));
      const sub = doc.createElement('small');
      sub.textContent = `(${champ.user_name}) · ${topDiv!.name}`;
      nameEl.appendChild(sub);
      text.appendChild(label);
      text.appendChild(nameEl);
      banner.appendChild(text);
      face.appendChild(banner);
    }
  }

  // Suppress the renderer's own season header — the face-head above already
  // prints the season/finale line (avoids showing it twice).
  face.appendChild(renderLeagueStandings(doc, standings, { showSeasonHeader: false }));
  return face;
}
