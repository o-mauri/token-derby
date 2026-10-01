import type { HeartbeatResponse } from '@token-derby/shared';
import type { BeatSnapshot } from '../tokens/race-score.js';
import { logInfo, logError } from '../log/logger.js';

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
    if (!stopped) logInfo('beat.stop', { retry: retryIndex });
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
      if (!pending) {
        // A `beat.prepare.start` with no matching `beat.prepare.done` in the log
        // is the signature of a token scan that hung — the whole loop waits here.
        logInfo('beat.prepare.start');
        const startedAt = Date.now();
        pending = await opts.prepareBeat(); // prepare once per beat
        logInfo('beat.prepare.done', { seq: pending.seq, ms: Date.now() - startedAt });
      }
      const snapshot = pending;
      const sentAt = Date.now();
      const resp = await opts.sendBeat(snapshot);
      logInfo('beat.send.ok', { seq: snapshot.seq, ms: Date.now() - sentAt, race_status: resp.race_status });
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
      logError('beat.send.err', {
        seq: pending?.seq,
        code: (err as { code?: string })?.code,
        message: (err as Error)?.message ?? String(err),
        retry: retryIndex,
        next_ms: delay,
      });
      retryIndex += 1;
      schedule(delay);
    }
  };

  schedule(0);
}
