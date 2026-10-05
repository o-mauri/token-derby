import { BOUNCE, type ScrollDirection, autoScrollDirection, computeAutoScrollY, phaseForScrollY } from './autoscroll';

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

/** The auto-scroll bounce, backing off while the viewer scrolls and resuming from where they left it. */
export class AutoScrollController {
  private direction: ScrollDirection = 'down';
  private manualAt = 0; // last manual scroll; 0 while auto-driving
  private written = -1; // last scrollTop this controller set

  constructor(private start: number) {}

  static isScrollKey(key: string): boolean {
    return SCROLL_KEYS.has(key);
  }

  suspend(now: number): void {
    this.manualAt = now;
  }

  // A scroll this controller didn't cause means the viewer (or their momentum) moved the track.
  scrolled(now: number, scrollTop: number): void {
    if (!this.manualAt && Math.abs(scrollTop - this.written) <= 1) return;
    this.suspend(now);
  }

  /** The scrollTop to write this frame, or null to leave the viewer in charge. */
  frame(now: number, scrollTop: number, maxScroll: number): number | null {
    if (this.manualAt) {
      if (now - this.manualAt < BOUNCE.RESUME_MS) return null;
      this.start = now - phaseForScrollY(scrollTop, maxScroll, this.direction);
      this.manualAt = 0;
    }
    const elapsed = now - this.start;
    this.direction = autoScrollDirection(elapsed);
    return computeAutoScrollY(elapsed, maxScroll);
  }

  wrote(scrollTop: number): void {
    this.written = scrollTop;
  }
}
