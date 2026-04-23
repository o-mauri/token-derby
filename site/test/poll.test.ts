import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPollLoop, type PollLoopOptions } from '../src/poll.js';
import type { GetRaceResponse } from '@token-derby/shared';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const sample: GetRaceResponse = {
  race_id: 'r1', name: 'X', start_time: 's', end_time: 'e', tz: 'UTC',
  max_participants: 30, join_code: 'JC1234', created_at: 'c',
  status: 'live', horses: [], server_time: 'now', time_left_seconds: 100,
};

function makeOpts(overrides: Partial<PollLoopOptions> = {}): PollLoopOptions {
  return {
    fetchRace: vi.fn().mockResolvedValue(sample),
    intervalMs: 3_000,
    onSnapshot: vi.fn(),
    onError: vi.fn(),
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe('runPollLoop', () => {
  it('immediately polls on start', async () => {
    const opts = makeOpts();
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.fetchRace).toHaveBeenCalledOnce();
    expect(opts.onSnapshot).toHaveBeenCalledWith(sample);
  });

  it('polls again after intervalMs', async () => {
    const opts = makeOpts();
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.fetchRace).toHaveBeenCalledTimes(2);
  });

  it('continues polling after an error', async () => {
    const fetchRace = vi.fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(sample);
    const opts = makeOpts({ fetchRace });
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.onSnapshot).toHaveBeenCalledWith(sample);
  });

  it('stops when abortSignal fires', async () => {
    const ctrl = new AbortController();
    const opts = makeOpts({ abortSignal: ctrl.signal });
    runPollLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(opts.fetchRace).toHaveBeenCalledOnce();
  });
});
