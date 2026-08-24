import { describe, it, expect, vi, afterEach } from 'vitest';
import { linkCommand } from '../../src/commands/link.js';
import { ApiError } from '../../src/api/client.js';
import type { GetJockeyResponse, WebSessionCreateResponse } from '@token-derby/shared';

function jockey(overrides: Partial<GetJockeyResponse> = {}): GetJockeyResponse {
  return {
    user_id: 'user-1',
    display_name: 'Omar',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function session(overrides: Partial<WebSessionCreateResponse> = {}): WebSessionCreateResponse {
  return { code: 'GRANT123', ...overrides };
}

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  return {
    logs, errors,
    restore: () => { console.log = origLog; console.error = origError; },
  };
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.TOKEN_DERBY_API_BASE;
});

describe('linkCommand', () => {
  it('already linked: prints the email, exits 0, and never mints a grant', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, sleepImpl: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(con.logs.join('\n')).toContain('Already linked to omar@stackone.com.');
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    expect(apiGetJockey).toHaveBeenCalledTimes(1);
  });

  it('prints a /link URL carrying the minted grant, and opens it', async () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn().mockResolvedValue(session({ code: 'GRANT123' }));
    const spawnImpl = vi.fn(() => ({ on: () => {}, unref: () => {} })) as any;
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, spawnImpl, sleepImpl: vi.fn() });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('https://example.test/link#code=GRANT123');
    expect(spawnImpl).toHaveBeenCalled();
    const args = spawnImpl.mock.calls[0];
    expect(JSON.stringify(args)).toContain('https://example.test/link#code=GRANT123');
  });

  it('polls repeatedly while unlinked and stops as soon as the email appears', async () => {
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())                                     // initial "already linked?" check
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey())                                     // poll: still no email
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));      // poll: linked
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession, spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any, sleepImpl });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    expect(apiGetJockey).toHaveBeenCalledTimes(4);
    // One sleep between each unlinked poll, none after the linked one.
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(con.logs.join('\n')).toContain('✓ Linked to omar@stackone.com.');
  });

  it('fails with an honest message and a non-zero exit once the bounded wait elapses', async () => {
    vi.useFakeTimers();
    const apiGetJockey = vi.fn().mockResolvedValue(jockey()); // never gains an email
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    // Time only moves when the command sleeps, so the fake clock advances in
    // lockstep with the poll loop and nothing waits in real time.
    const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({
        apiGetJockey, apiCreateWebSession,
        spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
        sleepImpl,
      });
    } finally {
      con.restore();
      vi.useRealTimers();
    }

    expect(rc).toBe(1);
    expect(con.errors.join('\n')).toMatch(/timed out/i);
  });

  it('does not hang and does not need a TTY to run the polling loop to completion', async () => {
    vi.useFakeTimers();
    const origIsTTY = process.stdin.isTTY;
    (process.stdin as any).isTTY = undefined;
    const apiGetJockey = vi.fn()
      .mockResolvedValueOnce(jockey())
      .mockResolvedValueOnce(jockey({ email: 'omar@stackone.com' }));
    const apiCreateWebSession = vi.fn().mockResolvedValue(session());
    const sleepImpl = vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); });
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({
        apiGetJockey, apiCreateWebSession,
        spawnImpl: vi.fn(() => ({ on: () => {}, unref: () => {} })) as any,
        sleepImpl,
      });
    } finally {
      con.restore();
      vi.useRealTimers();
      (process.stdin as any).isTTY = origIsTTY;
    }

    expect(rc).toBe(0);
    expect(con.logs.join('\n')).toContain('✓ Linked to omar@stackone.com.');
  });

  it('surfaces an ApiError from the initial check without minting a grant', async () => {
    const apiGetJockey = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'no credential', 401));
    const apiCreateWebSession = vi.fn();
    const con = captureConsole();

    let rc: number;
    try {
      rc = await linkCommand({ apiGetJockey, apiCreateWebSession });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(apiCreateWebSession).not.toHaveBeenCalled();
    expect(con.errors.join('\n')).toContain('UNAUTHENTICATED');
  });
});
