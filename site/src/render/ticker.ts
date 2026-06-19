import type { GetRaceResponse } from '@token-derby/shared';
import { describeAchievement } from '@token-derby/shared';

export type TickerItem = {
  horseName: string;
  name: string;
  description: string;
  xp: number;
};

// Pull every recent_event newer than the per-horse watermark into a flat,
// render-ready batch, advancing the watermark in place. Descriptions are
// race-aware: when the race counts input tokens, the Stampede!/Pulled Away!
// thresholds are scaled by the input multiplier to match the CLI. Returns []
// when the snapshot carries nothing new (in which case the ticker keeps its
// last batch rolling rather than going blank).
export function collectFreshItems(
  race: GetRaceResponse,
  shownAt: Map<string, number>,
): TickerItem[] {
  const items: TickerItem[] = [];
  for (const horse of race.horses) {
    const watermark = shownAt.get(horse.horse_id) ?? 0;
    const fresh = (horse.recent_events ?? []).filter((e) => e.at > watermark);
    if (fresh.length === 0) continue;
    shownAt.set(horse.horse_id, Math.max(...fresh.map((e) => e.at)));
    for (const ev of fresh) {
      items.push({
        horseName: horse.name,
        name: ev.name,
        description: describeAchievement(ev, race),
        xp: ev.xp,
      });
    }
  }
  return items;
}

export function renderTickerItem(doc: Document, item: TickerItem): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'achievement-ticker-item';

  const xp = doc.createElement('span');
  xp.className = 'achievement-ticker-xp';
  xp.textContent = `+${item.xp} XP`;
  root.appendChild(xp);

  const name = doc.createElement('span');
  name.className = 'achievement-ticker-horse';
  name.textContent = item.horseName;
  root.appendChild(name);

  const ach = doc.createElement('span');
  ach.className = 'achievement-ticker-name';
  ach.textContent = item.name;
  root.appendChild(ach);

  const desc = doc.createElement('span');
  desc.className = 'achievement-ticker-desc';
  desc.textContent = item.description;
  root.appendChild(desc);

  return root;
}

// Bullet shown between achievements within a single pass.
export function renderTickerSep(doc: Document): HTMLElement {
  const sep = doc.createElement('div');
  sep.className = 'achievement-ticker-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '•';
  return sep;
}

// The loop seam: a wide blank break marking the end of one pass and the start
// of the next, so a repeating batch reads as a repeat rather than as distinct
// achievements. Its width is set dynamically by the ticker.
export function renderTickerGap(doc: Document): HTMLElement {
  const gap = doc.createElement('div');
  gap.className = 'achievement-ticker-gap';
  gap.setAttribute('aria-hidden', 'true');
  return gap;
}

export type Ticker = {
  el: HTMLElement;
  /**
   * Swap the looping source. Items already on screen keep scrolling off the
   * left; everything appended from here on comes from `items`, so the ticker
   * seamlessly transitions from the old batch to the new one while never
   * stopping. An empty batch is ignored — the current loop keeps running.
   */
  setBatch(items: TickerItem[]): void;
  destroy(): void;
};

const SPEED_PX_PER_S = 70;
const FILL_BUFFER_PX = 96; // keep this much content past the right edge
const MIN_GAP_PX = 140; // smallest loop-seam gap (used for long batches)

export function createTicker(doc: Document): Ticker {
  const el = doc.createElement('div');
  el.className = 'achievement-ticker is-empty';

  const track = doc.createElement('div');
  track.className = 'achievement-ticker-track';
  el.appendChild(track);

  let batch: TickerItem[] = [];
  let cursor = 0;
  let pos = 0; // px the track has scrolled to the left
  let widthSinceSeam = 0; // width emitted since the last loop-seam gap
  let mounted: { node: HTMLElement; width: number }[] = [];
  let paused = false;
  let lastT = 0;
  let raf: number | null = null;

  const win = (doc.defaultView ?? window) as Window;

  el.addEventListener('mouseenter', () => { paused = true; });
  el.addEventListener('mouseleave', () => { paused = false; });

  // Each pass emits: item, sep, item, sep, …, item, GAP. So a period is
  // 2*batch.length slots; the separator after the final item is the wide gap.
  function appendNext(): boolean {
    if (batch.length === 0) return false;
    const period = batch.length * 2;
    const slot = cursor % period;
    cursor++;
    const itemIndex = slot >> 1;
    const isItem = (slot & 1) === 0;
    const isSeam = !isItem && itemIndex === batch.length - 1;

    let node: HTMLElement;
    if (isItem) node = renderTickerItem(doc, batch[itemIndex]!);
    else if (isSeam) node = renderTickerGap(doc);
    else node = renderTickerSep(doc);

    track.appendChild(node);
    let width = Math.max(1, node.offsetWidth);

    if (isSeam) {
      // Stretch the gap so one full pass spans at least the viewport — a short
      // batch fully clears the screen before it repeats, instead of tiling.
      const viewport = el.clientWidth || 0;
      width = Math.max(MIN_GAP_PX, viewport - widthSinceSeam + MIN_GAP_PX);
      node.style.width = `${width}px`;
      widthSinceSeam = 0;
    } else {
      widthSinceSeam += width;
    }

    mounted.push({ node, width });
    return true;
  }

  function contentWidth(): number {
    let w = 0;
    for (const m of mounted) w += m.width;
    return w;
  }

  function frame(t: number) {
    raf = win.requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (!paused) pos += SPEED_PX_PER_S * dt;

    // Drop items that have fully scrolled past the left edge, keeping `pos`
    // bounded so it never overflows over a long-running race.
    while (mounted.length && mounted[0]!.width <= pos) {
      const first = mounted.shift()!;
      if (first.node.parentNode === track) track.removeChild(first.node);
      pos -= first.width;
    }

    // Keep the right edge covered. Bounded so a momentarily-unmeasured node
    // (width 0 → clamped to 1) can't spin forever.
    const viewport = el.clientWidth || 0;
    for (let guard = 0; guard < 200; guard++) {
      if (contentWidth() - pos >= viewport + FILL_BUFFER_PX) break;
      if (!appendNext()) break;
    }

    el.classList.toggle('is-empty', mounted.length === 0);
    track.style.transform = `translateX(${-pos}px)`;
  }

  raf = win.requestAnimationFrame(frame);

  return {
    el,
    setBatch(items: TickerItem[]) {
      if (items.length === 0) return;
      batch = items.slice();
      cursor = 0;
      widthSinceSeam = 0;
    },
    destroy() {
      if (raf !== null) win.cancelAnimationFrame(raf);
      raf = null;
      mounted = [];
      track.replaceChildren();
    },
  };
}
