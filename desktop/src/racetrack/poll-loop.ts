// Ported from site/src/poll.ts's `runPollLoop` — same fetch-then-wait-then-
// repeat shape, generalised so the caller supplies the fetch function under
// whatever name fits. render.ts calls this with its injected `getRace` seam
// in place of the site's real `fetchRace`.
export type RacePollLoopOptions<T> = {
  fetchOne: () => Promise<T>;
  intervalMs: number;
  onSnapshot: (value: T) => void;
  onError: (err: unknown) => void;
  abortSignal: AbortSignal;
};

export function runRacePollLoop<T>(opts: RacePollLoopOptions<T>): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  opts.abortSignal.addEventListener('abort', stop, { once: true });

  const tick = async () => {
    if (stopped) return;
    try {
      const value = await opts.fetchOne();
      if (!stopped) opts.onSnapshot(value);
    } catch (err) {
      if (!stopped) opts.onError(err);
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs);
  };

  timer = setTimeout(tick, 0);
}
