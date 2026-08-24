import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { whoamiCommand } from '../../src/commands/whoami.js';
import { ApiError } from '../../src/api/client.js';
import type { GetJockeyResponse } from '@token-derby/shared';

function jockey(overrides: Partial<GetJockeyResponse> = {}): GetJockeyResponse {
  return {
    user_id: 'user-1',
    display_name: 'Omar',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
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
  vi.restoreAllMocks();
});

describe('whoamiCommand', () => {
  it('prints name, email, and device label when all three are present', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(
      jockey({ email: 'omar@stackone.com', device_label: 'omars-laptop' }),
    );
    const con = captureConsole();

    let rc: number;
    try {
      rc = await whoamiCommand({ apiGetJockey });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('Omar');
    expect(out).toContain('omar@stackone.com');
    expect(out).toContain('this machine: omars-laptop');
  });

  it('linked account on a legacy credential: name and email, no device line', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(
      jockey({ email: 'omar@stackone.com' }),
    );
    const con = captureConsole();

    let rc: number;
    try {
      rc = await whoamiCommand({ apiGetJockey });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('Omar');
    expect(out).toContain('omar@stackone.com');
    expect(out).not.toContain('this machine');
  });

  it('unlinked account on a device credential: name and device line, no email line', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(
      jockey({ device_label: 'omars-desktop' }),
    );
    const con = captureConsole();

    let rc: number;
    try {
      rc = await whoamiCommand({ apiGetJockey });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('Omar');
    expect(out).toContain('this machine: omars-desktop');
    expect(out).not.toMatch(/@/);
  });

  it('neither email nor device label: just the name, no stray labels', async () => {
    const apiGetJockey = vi.fn().mockResolvedValue(jockey());
    const con = captureConsole();

    let rc: number;
    try {
      rc = await whoamiCommand({ apiGetJockey });
    } finally {
      con.restore();
    }

    expect(rc).toBe(0);
    const out = con.logs.join('\n');
    expect(out).toContain('Omar');
    expect(out).not.toContain('this machine');
    expect(out).not.toContain('undefined');
    expect(out).not.toMatch(/@/);
  });

  it('surfaces an ApiError without throwing', async () => {
    const apiGetJockey = vi.fn().mockRejectedValue(new ApiError('UNAUTHENTICATED', 'no credential', 401));
    const con = captureConsole();

    let rc: number;
    try {
      rc = await whoamiCommand({ apiGetJockey });
    } finally {
      con.restore();
    }

    expect(rc).toBe(1);
    expect(con.errors.join('\n')).toContain('UNAUTHENTICATED');
  });
});
