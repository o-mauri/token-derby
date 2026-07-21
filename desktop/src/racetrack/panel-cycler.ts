// Ported unchanged from site/src/render/panel-cycler.ts — pure aside from an
// injectable `win` (already defaulted to the real `window`), no seam changes
// needed.
export type Cycler = {
  destroy(): void;
  next(): void;
  prev(): void;
  goTo(index: number): void;
};

export type CyclerOptions = {
  panels: HTMLElement[];
  intervalMs: number;
  win?: Window;
  // Fired with the active index on start and on every change (auto or manual).
  onChange?: (index: number) => void;
};

export function startCycler({ panels, intervalMs, win = window, onChange }: CyclerOptions): Cycler {
  panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));
  if (panels.length === 0) {
    return { destroy() {}, next() {}, prev() {}, goTo() {} };
  }

  let active = 0;
  let id: ReturnType<Window['setInterval']> | null = null;

  // Move to `index` (wrapping), update the active class, and report the change.
  const show = (index: number) => {
    panels[active]!.classList.remove('is-active');
    active = ((index % panels.length) + panels.length) % panels.length;
    panels[active]!.classList.add('is-active');
    onChange?.(active);
  };

  const startTimer = () => {
    if (panels.length <= 1) return; // nothing to rotate
    id = win.setInterval(() => show(active + 1), intervalMs);
  };

  // Manual navigation resets the timer so the full interval elapses from the
  // user's new position rather than flipping again almost immediately.
  const resetTimer = () => {
    if (id !== null) { win.clearInterval(id); id = null; }
    startTimer();
  };

  onChange?.(active); // report the initial page
  startTimer();

  return {
    destroy() { if (id !== null) win.clearInterval(id); id = null; },
    next() { show(active + 1); resetTimer(); },
    prev() { show(active - 1); resetTimer(); },
    goTo(index: number) { show(index); resetTimer(); },
  };
}
