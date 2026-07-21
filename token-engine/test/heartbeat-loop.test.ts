import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHeartbeatLoop } from '../src/heartbeat-loop.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('re-sends the identical snapshot on retry, re-prepares after success', async () => {
  let n = 0;
  const prepareBeat = vi.fn(async () => ({ seq: ++n, components: { claude: n * 10, codex: 0, gemini: 0 }, readings: { claude: n * 100, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
  const sent: any[] = [];
  const sendBeat = vi.fn(async (snap: any) => {
    sent.push(snap);
    if (sent.length === 1) throw new Error('network'); // first send fails
    return { race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 1, last_seq: snap.seq } as any;
  });
  const ctrl = new AbortController();
  runHeartbeatLoop({
    prepareBeat, sendBeat,
    onSuccess: () => {}, onError: () => {}, onFinished: () => {},
    intervalMs: 1000, retryDelaysMs: [10], abortSignal: ctrl.signal,
  });
  await vi.advanceTimersByTimeAsync(0);    // first beat prepared + sent (fails)
  await vi.advanceTimersByTimeAsync(10);   // retry: same snapshot re-sent (succeeds)
  expect(prepareBeat).toHaveBeenCalledTimes(1);
  expect(sent[0]).toEqual(sent[1]);        // identical payload across retry
  await vi.advanceTimersByTimeAsync(1000); // next beat
  expect(prepareBeat).toHaveBeenCalledTimes(2);
  ctrl.abort();
});

it('stops and calls onFinished when race_status is finished', async () => {
  const prepareBeat = vi.fn(async () => ({ seq: 1, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
  const onFinished = vi.fn();
  const sendBeat = vi.fn(async (snap: any) => ({ race_status: 'finished', horses: [], race: {}, server_time: '', time_left_seconds: 0, last_seq: snap.seq } as any));
  const ctrl = new AbortController();
  runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess: () => {}, onError: () => {}, onFinished, intervalMs: 1000, retryDelaysMs: [10], abortSignal: ctrl.signal });
  await vi.advanceTimersByTimeAsync(0);
  expect(onFinished).toHaveBeenCalledTimes(1);
  ctrl.abort();
});

describe('runHeartbeatLoop', () => {
  it('sends an immediate first heartbeat', async () => {
    const prepareBeat = vi.fn(async () => ({ seq: 1, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const onSuccess = vi.fn();
    const sendBeat = vi.fn(async (snap: any) => ({ race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 100, last_seq: snap.seq } as any));
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess, onError: () => {}, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000], abortSignal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(sendBeat).toHaveBeenCalledOnce();
    ctrl.abort();
  });

  it('sends another heartbeat after intervalMs', async () => {
    const prepareBeat = vi.fn(async () => ({ seq: 1, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const sendBeat = vi.fn(async (snap: any) => ({ race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 100, last_seq: snap.seq } as any));
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess: () => {}, onError: () => {}, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000], abortSignal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendBeat).toHaveBeenCalledTimes(2);
    ctrl.abort();
  });

  it('retries with backoff after a failure', async () => {
    let callCount = 0;
    const prepareBeat = vi.fn(async () => ({ seq: ++callCount, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const sendBeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('still'))
      .mockImplementation(async (snap: any) => ({ race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 100, last_seq: snap.seq } as any));
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess, onError, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000, 2_000, 4_000], abortSignal: ctrl.signal });

    await vi.advanceTimersByTimeAsync(0);
    expect(sendBeat).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sendBeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(sendBeat).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    ctrl.abort();
  });

  it('caps retry delay at the last value', async () => {
    const prepareBeat = vi.fn(async () => ({ seq: 1, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const sendBeat = vi.fn().mockRejectedValue(new Error('always'));
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess: () => {}, onError: () => {}, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000, 2_000], abortSignal: ctrl.signal });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sendBeat).toHaveBeenCalledTimes(5);
    ctrl.abort();
  });

  it('after success, resumes on the normal interval rather than backoff', async () => {
    let callCount = 0;
    const prepareBeat = vi.fn(async () => ({ seq: ++callCount, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const sendBeat = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementation(async (snap: any) => ({ race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 100, last_seq: snap.seq } as any));
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess: () => {}, onError: () => {}, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000, 2_000, 4_000], abortSignal: ctrl.signal });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sendBeat).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendBeat).toHaveBeenCalledTimes(3);
    ctrl.abort();
  });

  it('stops sending after abortSignal aborts', async () => {
    const prepareBeat = vi.fn(async () => ({ seq: 1, components: { claude: 0, codex: 0, gemini: 0 }, readings: { claude: 0, codex: 0, gemini: 0 }, primaryConvReadings: {} }));
    const sendBeat = vi.fn(async (snap: any) => ({ race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 100, last_seq: snap.seq } as any));
    const ctrl = new AbortController();
    runHeartbeatLoop({ prepareBeat, sendBeat, onSuccess: () => {}, onError: () => {}, onFinished: () => {}, intervalMs: 60_000, retryDelaysMs: [1_000], abortSignal: ctrl.signal });

    await vi.advanceTimersByTimeAsync(0);
    expect(sendBeat).toHaveBeenCalledOnce();

    ctrl.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendBeat).toHaveBeenCalledOnce();
  });
});
