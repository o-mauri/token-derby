import type { HorseColors, MarketPrice } from '@token-derby/shared';
import { toPrice } from '@token-derby/shared';
import { esc } from '../../esc.js';
import { formatDuration, predictTimeLeftSeconds, type CountdownAnchor } from '../../time.js';

// A chip is "lead" if it's within this fraction of the row's top price — the
// leading group can be one runner (a decided win market) or several (a tight
// podium market); a flat fraction of the row's own max reads well at both.
const LEAD_FRACTION = 0.3;

export type BoardHorse = {
  horse_id: string;
  name: string;
  colors: HorseColors;
  division?: number;
  // Detail-chart extras — absent from the summary chip rendering below.
  jockey?: string;
  banked?: number;
  rank?: number;
};

export type BoardData = {
  raceName: string;
  runnerCount: number;
  // null once the race has finished — no clock left to run.
  timeLeftSeconds: number | null;
  finished: boolean;
  // League fixtures only; index 0 = division 1 (top flight).
  divisionNames?: string[];
  horses: BoardHorse[];
  prices: MarketPrice[];
};

export type Priced = BoardHorse & {
  win: number; podium: number; divisionPrice: number | null; divisionPodiumPrice: number | null;
};

export type ChartMarket = 'win' | 'podium' | 'division' | 'divisionPodium';

export type MarketRow = {
  name: string;
  meta: string;
  market: ChartMarket;
  runners: Array<{ horse: BoardHorse; price: number }>;
};

export type Section = { heading: string; rows: MarketRow[] };

// A market row plus the section it lives under — enough to open its detail chart.
export type OpenRow = MarketRow & { heading: string };

function joinPrices(horses: BoardHorse[], prices: MarketPrice[]): Priced[] {
  const byId = new Map(prices.map((p) => [p.horse_id, p]));
  return horses.map((h) => {
    const p = byId.get(h.horse_id);
    return {
      ...h, win: p?.win ?? 0, podium: p?.podium ?? 0,
      divisionPrice: p?.division ?? null, divisionPodiumPrice: p?.divisionPodium ?? null,
    };
  });
}

// To Win / To Podium overall, then Win/Podium per division. A division's Win
// market needs >=2 runners to mean anything, Podium needs >=4.
export function buildSections(priced: Priced[], divisionNames: string[] | undefined): Section[] {
  const sections: Section[] = [];

  const byWin = [...priced].sort((a, b) => b.win - a.win).map((h) => ({ horse: h, price: h.win }));
  const byPodium = [...priced].sort((a, b) => b.podium - a.podium).map((h) => ({ horse: h, price: h.podium }));
  sections.push({
    heading: 'The race',
    rows: [
      { name: 'To Win', meta: `${priced.length} runners`, market: 'win', runners: byWin },
      { name: 'To Podium', meta: `${priced.length} runners`, market: 'podium', runners: byPodium },
    ],
  });

  const divisions = [...new Set(priced.map((h) => h.division).filter((d): d is number => d != null))]
    .sort((a, b) => a - b);

  for (const d of divisions) {
    const members = priced.filter((h) => h.division === d);
    const label = divisionNames?.[d - 1] ?? `Division ${d}`;
    const rows: MarketRow[] = [];
    if (members.length >= 2) {
      rows.push({
        name: `Win ${label}`,
        meta: `${members.length} runners`,
        market: 'division',
        runners: [...members]
          .sort((a, b) => (b.divisionPrice ?? 0) - (a.divisionPrice ?? 0))
          .map((h) => ({ horse: h, price: h.divisionPrice ?? 0 })),
      });
    }
    // A member with no divisionPodiumPrice means this snapshot predates the
    // field (staging may hold some) — suppress rather than fake a 0.00 price.
    const hasDivisionPodium = members.every((h) => h.divisionPodiumPrice != null);
    if (members.length >= 4 && hasDivisionPodium) {
      rows.push({
        name: `Podium ${label}`,
        meta: `${members.length} runners`,
        market: 'divisionPodium',
        runners: [...members]
          .sort((a, b) => (b.divisionPodiumPrice ?? 0) - (a.divisionPodiumPrice ?? 0))
          .map((h) => ({ horse: h, price: h.divisionPodiumPrice ?? 0 })),
      });
    }
    if (rows.length) sections.push({ heading: `${label} · ${members.length} runners`, rows });
  }

  return sections;
}

function renderChip(r: { horse: BoardHorse; price: number }, threshold: number): string {
  const price = toPrice(r.price);
  const lead = price >= threshold;
  return `
    <span class="dm-chip ${lead ? 'dm-chip--lead' : 'dm-chip--rest'}">
      <i class="dm-silk" style="background:${esc(r.horse.colors.body)}" aria-hidden="true"></i>
      <span class="dm-chip-name">${esc(r.horse.name)}</span>
      <span class="dm-chip-price">${price.toFixed(2)}</span>
    </span>`;
}

function renderRow(row: MarketRow): string {
  const top = row.runners[0] ? toPrice(row.runners[0].price) : 0;
  const threshold = top * LEAD_FRACTION;
  return `
    <button type="button" class="dm-row">
      <div class="dm-row-left">
        <div class="dm-market-name">${esc(row.name)}</div>
        <div class="dm-market-meta">${esc(row.meta)}</div>
      </div>
      <div class="dm-chips">${row.runners.map((r) => renderChip(r, threshold)).join('')}</div>
      <div class="dm-chev" aria-hidden="true">›</div>
    </button>`;
}

function renderSection(section: Section): string {
  return `
    <div class="dm-section-head">${esc(section.heading)}</div>
    <div class="dm-stack">${section.rows.map(renderRow).join('')}</div>`;
}

// Rows and their DOM buttons are built from the same sections array in the
// same order, so position i in one lines up with position i in the other —
// no data attribute needed to reconnect them after innerHTML parses.
function flattenRows(sections: Section[]): OpenRow[] {
  return sections.flatMap((s) => s.rows.map((r) => ({ ...r, heading: s.heading })));
}

// Never leaves a chip clipped mid-way: measures after layout and hides any
// chip whose right edge overflows the container, keeping at least the leader.
function fitChips(container: HTMLElement): void {
  const chips = Array.from(container.querySelectorAll<HTMLElement>('.dm-chip'));
  chips.forEach((c) => { c.hidden = false; });
  const limit = container.clientWidth;
  let cut = false;
  chips.forEach((chip, i) => {
    if (cut) { chip.hidden = true; return; }
    if (i > 0 && chip.offsetLeft + chip.offsetWidth > limit) { chip.hidden = true; cut = true; }
  });
}

function statusText(data: BoardData, anchor: CountdownAnchor | null): string {
  if (data.finished) return `${data.runnerCount} runners · final prices — race finished`;
  const left = anchor ? predictTimeLeftSeconds(anchor, Date.now()) : 0;
  return `${data.runnerCount} runners · ${formatDuration(left)} to run · prices update every minute`;
}

/** Renders the full market board — every market stays open and equally
 *  weighted, never labelled or reordered by price. `onOpenRow`, if given,
 *  fires when a market row is activated (click, Enter or Space) so the
 *  caller can open that market's detail chart. Returns a dispose function
 *  that stops the clock tick and disconnects the chip-fit observer. */
export function renderBoard(root: HTMLElement, data: BoardData, onOpenRow?: (row: OpenRow) => void): () => void {
  const priced = joinPrices(data.horses, data.prices);
  const sections = buildSections(priced, data.divisionNames);
  const anchor: CountdownAnchor | null = data.timeLeftSeconds != null
    ? { atMs: Date.now(), timeLeftSeconds: data.timeLeftSeconds }
    : null;

  root.innerHTML = `
    <div class="dm">
      <div class="dm-status">
        ${data.finished ? '' : '<span class="dm-dot" aria-hidden="true"></span>'}
        <strong class="dm-race-name">${esc(data.raceName)}</strong>
        <span class="dm-status-meta">· <span class="dm-status-text">${esc(statusText(data, anchor))}</span></span>
      </div>
      ${sections.map(renderSection).join('')}
    </div>`;

  const flatRows = flattenRows(sections);
  root.querySelectorAll<HTMLButtonElement>('.dm-row').forEach((btn, i) => {
    btn.addEventListener('click', () => onOpenRow?.(flatRows[i]!));
  });

  let tickTimer: ReturnType<typeof setInterval> | null = null;
  if (anchor) {
    const textEl = root.querySelector<HTMLElement>('.dm-status-text')!;
    tickTimer = setInterval(() => { textEl.textContent = statusText(data, anchor); }, 1000);
  }

  const chipsContainers = Array.from(root.querySelectorAll<HTMLElement>('.dm-chips'));
  chipsContainers.forEach(fitChips);
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) fitChips(entry.target as HTMLElement);
  });
  chipsContainers.forEach((el) => ro.observe(el));

  return () => {
    if (tickTimer) clearInterval(tickTimer);
    ro.disconnect();
  };
}

export function renderNoLiveRace(root: HTMLElement): void {
  root.innerHTML = `
    <section class="dm-empty">
      <h2>No live race</h2>
      <p>There's no live race for your organisation right now. Start one, or come back once
      one is running, then reopen the board with <span class="cmd">token-derby derbymarket</span>.</p>
    </section>`;
}

export function renderMarketNotOpen(root: HTMLElement, opts: { raceName: string; opensInSeconds: number }): () => void {
  const anchor: CountdownAnchor = { atMs: Date.now(), timeLeftSeconds: opts.opensInSeconds };
  root.innerHTML = `
    <section class="dm-empty">
      <h2>${esc(opts.raceName)}</h2>
      <p>The market opens once the race has been running for a few minutes, so prices reflect
      real form rather than a standing start.</p>
      <p class="cmd dm-countdown">${formatDuration(anchor.timeLeftSeconds)}</p>
    </section>`;
  const el = root.querySelector<HTMLElement>('.dm-countdown')!;
  const timer = setInterval(() => {
    el.textContent = formatDuration(predictTimeLeftSeconds(anchor, Date.now()));
  }, 1000);
  return () => clearInterval(timer);
}

export function renderNoMarketData(root: HTMLElement, opts: { raceName: string }): void {
  root.innerHTML = `
    <section class="dm-empty">
      <h2>${esc(opts.raceName)} has finished</h2>
      <p>Either the race ended before the market opened, or nobody had the board open while it
      was running — history is only written when someone is watching. There's no price history
      to show.</p>
    </section>`;
}

export function renderLoadError(root: HTMLElement): void {
  root.innerHTML = `
    <section class="dm-empty">
      <h2>Couldn't load the market</h2>
      <p>Something went wrong reaching the board. Retrying…</p>
    </section>`;
}
