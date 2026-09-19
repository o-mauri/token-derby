import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runHeartbeatLoop } from '../../src/runtime/heartbeat-loop.js';
import { _resetLoggerForTests } from '../../src/log/logger.js';
import { logFile } from '../../src/paths.js';

let home: string | undefined;

beforeEach(async () => {
  vi.useFakeTimers();
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-hblog-'));
  process.env.TOKEN_DERBY_HOME = home;
  _resetLoggerForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  if (home) { await fs.rm(home, { recursive: true, force: true }); home = undefined; }
  delete process.env.TOKEN_DERBY_HOME;
  _resetLoggerForTests();
});

function readLog(): string {
  return fsSync.existsSync(logFile()) ? fsSync.readFileSync(logFile(), 'utf8') : '';
}

const snapshot = { seq: 1, components: { anthropic: 0, openai: 0, google: 0 }, convReadings: { anthropic: {}, openai: {}, google: {} } };
const okResponse = { race_status: 'live', horses: [], race: {}, server_time: '', time_left_seconds: 1, last_seq: 1 } as any;

describe('heartbeat loop logging', () => {
  it('leaves a prepare with no matching done when the token scan hangs', async () => {
    const ctrl = new AbortController();
    runHeartbeatLoop({
      prepareBeat: () => new Promise(() => {}), // hangs forever, like a stuck scan
      sendBeat: async () => okResponse,
      onSuccess: () => {}, onError: () => {}, onFinished: () => {},
      intervalMs: 1000, retryDelaysMs: [10], abortSignal: ctrl.signal,
    });
    await vi.advanceTimersByTimeAsync(0);

    const text = readLog();
    expect(text).toContain('beat.prepare.start');
    expect(text).not.toContain('beat.prepare.done');
    ctrl.abort();
  });

  it('records a successful beat with its sequence number', async () => {
    const ctrl = new AbortController();
    runHeartbeatLoop({
      prepareBeat: async () => snapshot,
      sendBeat: async () => okResponse,
      onSuccess: () => {}, onError: () => {}, onFinished: () => {},
      intervalMs: 1000, retryDelaysMs: [10], abortSignal: ctrl.signal,
    });
    await vi.advanceTimersByTimeAsync(0);

    const text = readLog();
    expect(text).toContain('beat.prepare.done');
    expect(text).toContain('beat.send.ok');
    expect(text).toContain('"seq":1');
    ctrl.abort();
  });

  it('records a failed send with its retry index and the delay before the next try', async () => {
    const ctrl = new AbortController();
    runHeartbeatLoop({
      prepareBeat: async () => snapshot,
      sendBeat: async () => { throw new Error('network down'); },
      onSuccess: () => {}, onError: () => {}, onFinished: () => {},
      intervalMs: 1000, retryDelaysMs: [10], abortSignal: ctrl.signal,
    });
    await vi.advanceTimersByTimeAsync(0);

    const text = readLog();
    expect(text).toContain('ERROR beat.send.err');
    expect(text).toContain('network down');
    expect(text).toContain('"retry":0');
    expect(text).toContain('"next_ms":10');
    ctrl.abort();
  });
});
