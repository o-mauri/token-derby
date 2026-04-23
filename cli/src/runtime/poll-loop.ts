import type { GetRaceResponse } from '@token-derby/shared';

export type PollLoopOptions = {
  fetchRace: () => Promise<GetRaceResponse>;
  intervalMs: number;
  onSnapshot: (race: GetRaceResponse) => void;
  onError: (err: unknown) => void;
  abortSignal: AbortSignal;
};

export function runPollLoop(opts: PollLoopOptions): void {
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
      const race = await opts.fetchRace();
      if (!stopped) opts.onSnapshot(race);
    } catch (err) {
      if (!stopped) opts.onError(err);
    }
    if (!stopped) timer = setTimeout(tick, opts.intervalMs);
  };

  timer = setTimeout(tick, 0);
}
