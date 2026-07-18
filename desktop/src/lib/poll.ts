import { useCallback, useEffect, useRef, useState } from 'react';

export type PollState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refresh: () => void;
};

// Polls `fn` immediately, then again every `ms`, waiting for each call to
// settle before scheduling the next (no overlapping requests). Clears the
// timer on unmount and whenever `enabled` flips false; never fires while
// `enabled` is false. Mirrors site/src/poll.ts's runPollLoop semantics,
// wired up as a React hook instead of a raw abort-signal loop.
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled: boolean): PollState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(false);

  // Always call the latest `fn` without re-triggering the polling effect.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Guards against a stale in-flight call clobbering state after a newer
  // one (e.g. a manual refresh()) has already resolved.
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (seqRef.current === seq) {
        setData(result);
        setError(undefined);
      }
    } catch (err) {
      if (seqRef.current === seq) setError(err);
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (stopped) return;
      void run().then(() => {
        if (!stopped) timer = setTimeout(tick, ms);
      });
    };

    tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, ms, run]);

  return { data, error, loading, refresh };
}
