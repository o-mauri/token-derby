import { DestroyRef, type Signal, computed, effect, inject, signal, untracked } from '@angular/core';

export type PollStatus = 'idle' | 'loading' | 'resolved' | 'error';

export type PollOptions<P, T> = {
  // Reactive params; the poll restarts when they change, and pauses while they are null.
  params: () => P | null;
  loader: (params: P) => Promise<T>;
  // A fixed wait, or one chosen from the latest value (undefined before the first success).
  intervalMs: number | ((value: T | undefined) => number);
  // Stop polling once a value says so (a finished race).
  until?: (value: T) => boolean;
};

export type PollResource<T> = {
  readonly value: Signal<T | undefined>;
  readonly error: Signal<unknown>;
  readonly status: Signal<PollStatus>;
  readonly isLoading: Signal<boolean>;
};

/** Repeatedly loads data on an interval, as signals. The next request starts only after the previous one
 *  settles, a failure keeps the last good value and retries, and everything stops with the injection context. */
export function pollResource<P, T>(opts: PollOptions<P, T>): PollResource<T> {
  const value = signal<T | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const status = signal<PollStatus>('idle');
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => (typeof opts.intervalMs === 'number' ? opts.intervalMs : opts.intervalMs(untracked(value)));

  const stop = () => {
    generation++;
    clearTimeout(timer);
  };

  const run = (params: P, gen: number): void => {
    status.set('loading');
    opts.loader(params).then(
      (v) => {
        if (gen !== generation) return;
        value.set(v);
        error.set(undefined);
        status.set('resolved');
        if (!opts.until?.(v)) timer = setTimeout(() => run(params, gen), wait());
      },
      (e: unknown) => {
        if (gen !== generation) return;
        error.set(e);
        status.set('error');
        timer = setTimeout(() => run(params, gen), wait());
      },
    );
  };

  effect(() => {
    const params = opts.params();
    untracked(() => {
      stop();
      // New params: the old answer (and any error) belongs to something else now.
      value.set(undefined);
      error.set(undefined);
      status.set('idle');
      if (params === null) return;
      const gen = generation;
      timer = setTimeout(() => run(params, gen), 0);
    });
  });
  inject(DestroyRef).onDestroy(stop);

  return { value: value.asReadonly(), error: error.asReadonly(), status: status.asReadonly(), isLoading: computed(() => status() === 'loading') };
}
