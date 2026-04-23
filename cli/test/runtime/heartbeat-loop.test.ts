import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHeartbeatLoop, type HeartbeatLoopOptions } from '../../src/runtime/heartbeat-loop.js';
import type { HeartbeatResponse } from '@token-derby/shared';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const okResp: HeartbeatResponse = { race_status: 'live', server_time: 'now', time_left_seconds: 100 };

function makeOpts(overrides: Partial<HeartbeatLoopOptions> = {}): HeartbeatLoopOptions {
  return {
    sendHeartbeat: vi.fn().mockResolvedValue(okResp),
    getCurrentTokens: vi.fn().mockReturnValue(0),
    intervalMs: 60_000,
    retryDelaysMs: [1_000, 2_000, 4_000],
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onFinished: vi.fn(),
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe('runHeartbeatLoop', () => {
  it('sends an immediate first heartbeat', async () => {
    const opts = makeOpts();
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();
    expect(opts.sendHeartbeat).toHaveBeenCalledWith(0);
    expect(opts.onSuccess).toHaveBeenCalledWith(okResp);
  });

  it('sends another heartbeat after intervalMs', async () => {
    const opts = makeOpts();
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenCalledTimes(2);
  });

  it('reads current tokens fresh on each tick', async () => {
    const getCurrentTokens = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(250);
    const opts = makeOpts({ getCurrentTokens });
    runHeartbeatLoop(opts);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenNthCalledWith(1, 100);
    expect(opts.sendHeartbeat).toHaveBeenNthCalledWith(2, 250);
  });

  it('retries with backoff after a failure', async () => {
    const sendHeartbeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('still'))
      .mockResolvedValue(okResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    expect(sendHeartbeat).toHaveBeenCalledTimes(1);
    expect(opts.onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(3);
    expect(opts.onSuccess).toHaveBeenCalledWith(okResp);
  });

  it('caps retry delay at the last value', async () => {
    const sendHeartbeat = vi.fn().mockRejectedValue(new Error('always'));
    const opts = makeOpts({ sendHeartbeat, retryDelaysMs: [1_000, 2_000] });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(5);
  });

  it('after success, resumes on the normal interval rather than backoff', async () => {
    const sendHeartbeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(okResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(3);
  });

  it('calls onFinished and stops when race_status flips to finished', async () => {
    const finishedResp: HeartbeatResponse = { ...okResp, race_status: 'finished' };
    const sendHeartbeat = vi.fn().mockResolvedValue(finishedResp);
    const opts = makeOpts({ sendHeartbeat });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    expect(opts.onFinished).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendHeartbeat).toHaveBeenCalledOnce();
  });

  it('stops sending after abortSignal aborts', async () => {
    const ctrl = new AbortController();
    const opts = makeOpts({ abortSignal: ctrl.signal });
    runHeartbeatLoop(opts);

    await vi.advanceTimersByTimeAsync(0);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();

    ctrl.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(opts.sendHeartbeat).toHaveBeenCalledOnce();
  });
});
