import { FILL_BUFFER_PX, MIN_GAP_PX, type NextEmit, SPEED_PX_PER_S, type TickerCell, createPassScheduler, seamFloorFor } from './ticker';

/** A mounted ticker entry. Cells are measured after render; seams get their width up front. */
export type TickerSlot = { readonly key: number; readonly emit: NextEmit; width: number | null };

// A frame longer than this (a background tab) is clamped so the ticker doesn't leap.
const MAX_FRAME_S = 0.1;

/** The scrolling ticker, DOM-free: what is mounted, and how far it has scrolled. */
export class TickerEngine {
  slots: TickerSlot[] = [];
  offset = 0;
  paused = false;

  private readonly scheduler = createPassScheduler();
  private seamFloor = MIN_GAP_PX;
  private widthSinceSeam = 0;
  private nextKey = 0;

  /** Queue a new batch; it takes over at the end of the current pass, never mid-pass. */
  setCells(cells: TickerCell[]): void {
    this.scheduler.set(cells);
    this.seamFloor = seamFloorFor(this.scheduler.current());
  }

  /** Advance one frame, given the widths of cells rendered since the last frame. */
  frame(dtSeconds: number, viewport: number, measured: ReadonlyMap<number, number>): void {
    for (const slot of this.slots) {
      if (slot.width !== null) continue;
      const w = measured.get(slot.key);
      if (w === undefined) continue;
      slot.width = Math.max(1, w);
      this.widthSinceSeam += slot.width;
    }

    if (!this.paused) this.offset += SPEED_PX_PER_S * Math.min(MAX_FRAME_S, Math.max(0, dtSeconds));

    while (this.slots[0]?.width != null && this.slots[0].width <= this.offset) {
      this.offset -= this.slots.shift()!.width!;
    }

    // Keep the right edge covered; a new cell waits until the last one has a measured width.
    for (let guard = 0; guard < 200; guard++) {
      if (this.slots.at(-1)?.width === null) break;
      if (this.contentWidth() - this.offset >= viewport + FILL_BUFFER_PX) break;
      if (!this.append(viewport)) break;
    }
  }

  private append(viewport: number): boolean {
    const emit = this.scheduler.next();
    if (!emit) return false;
    if (emit.kind === 'cell') {
      this.slots.push({ key: this.nextKey++, emit, width: null });
      return true;
    }
    // Stretch the seam so a whole pass spans at least the viewport, then refresh the
    // floor for the pass that now begins (the scheduler may have swapped batches here).
    const width = Math.max(this.seamFloor, viewport - this.widthSinceSeam + this.seamFloor);
    this.slots.push({ key: this.nextKey++, emit, width });
    this.widthSinceSeam = 0;
    this.seamFloor = seamFloorFor(this.scheduler.current());
    return true;
  }

  private contentWidth(): number {
    return this.slots.reduce((sum, s) => sum + (s.width ?? 0), 0);
  }
}
