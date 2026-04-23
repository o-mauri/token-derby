import type { HeartbeatResponse } from '@token-derby/shared';

export type HeartbeatLoopOptions = {
  sendHeartbeat: (currentTokens: number) => Promise<HeartbeatResponse>;
  getCurrentTokens: () => number;
  intervalMs: number;
  retryDelaysMs: readonly number[];
  onSuccess: (resp: HeartbeatResponse) => void;
  onError: (err: unknown) => void;
  onFinished: () => void;
  abortSignal: AbortSignal;
};

export function runHeartbeatLoop(opts: HeartbeatLoopOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  opts.abortSignal.addEventListener('abort', stop, { once: true });

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const tokens = opts.getCurrentTokens();
      const resp = await opts.sendHeartbeat(tokens);
      retryIndex = 0;
      opts.onSuccess(resp);
      if (resp.race_status === 'finished') {
        opts.onFinished();
        stop();
        return;
      }
      schedule(opts.intervalMs);
    } catch (err) {
      opts.onError(err);
      const delay = opts.retryDelaysMs[Math.min(retryIndex, opts.retryDelaysMs.length - 1)] ?? 1_000;
      retryIndex += 1;
      schedule(delay);
    }
  };

  schedule(0);
}
