import type { HeartbeatResponse } from '@token-derby/shared';
import type { BeatSnapshot } from '../tokens/race-score.js';

export type HeartbeatLoopOptions = {
  /** Build (and persist intent for) the next beat. Called once per beat; the result is frozen across retries. */
  prepareBeat: () => Promise<BeatSnapshot>;
  /** Send a prepared snapshot to the API. */
  sendBeat: (snapshot: BeatSnapshot) => Promise<HeartbeatResponse>;
  intervalMs: number;
  retryDelaysMs: readonly number[];
  onSuccess: (resp: HeartbeatResponse, snapshot: BeatSnapshot) => void;
  onError: (err: unknown) => void;
  onFinished: () => void;
  abortSignal: AbortSignal;
};

export function runHeartbeatLoop(opts: HeartbeatLoopOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryIndex = 0;
  let stopped = false;
  let pending: BeatSnapshot | null = null; // frozen payload for retries

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
      if (!pending) pending = await opts.prepareBeat(); // prepare once per beat
      const snapshot = pending;
      const resp = await opts.sendBeat(snapshot);
      pending = null;       // beat acknowledged
      retryIndex = 0;
      opts.onSuccess(resp, snapshot);
      if (resp.race_status === 'finished') {
        opts.onFinished();
        stop();
        return;
      }
      schedule(opts.intervalMs);
    } catch (err) {
      opts.onError(err);    // keep `pending` so the retry re-sends the identical snapshot
      const delay = opts.retryDelaysMs[Math.min(retryIndex, opts.retryDelaysMs.length - 1)] ?? 1_000;
      retryIndex += 1;
      schedule(delay);
    }
  };

  schedule(0);
}
