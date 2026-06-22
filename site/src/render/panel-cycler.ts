export type Cycler = { destroy(): void };

export type CyclerOptions = {
  panels: HTMLElement[];
  intervalMs: number;
  win?: Window;
};

export function startCycler({ panels, intervalMs, win = window }: CyclerOptions): Cycler {
  panels.forEach((p, i) => p.classList.toggle('is-active', i === 0));
  if (panels.length <= 1) return { destroy() {} };

  let active = 0;
  const id = win.setInterval(() => {
    panels[active]!.classList.remove('is-active');
    active = (active + 1) % panels.length;
    panels[active]!.classList.add('is-active');
  }, intervalMs);

  return { destroy() { win.clearInterval(id); } };
}
