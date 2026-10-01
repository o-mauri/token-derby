import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { request, ApiError, _resetIdentityCacheForTests } from '../../src/api/client.js';
import { saveIdentity } from '../../src/identity/identity.js';
import { _resetLoggerForTests } from '../../src/log/logger.js';
import { logFile } from '../../src/paths.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-clientlog-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  _resetIdentityCacheForTests();
  _resetLoggerForTests();
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetIdentityCacheForTests();
  _resetLoggerForTests();
});

function readLog(): string {
  return fsSync.existsSync(logFile()) ? fsSync.readFileSync(logFile(), 'utf8') : '';
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

describe('api client logging', () => {
  it('records the request and its response status', async () => {
    await request('POST', '/races/ABCDEF/heartbeat', { seq: 3 }, undefined, fakeFetch(200, { ok: true }) as any);

    const text = readLog();
    expect(text).toContain('http.req');
    expect(text).toContain('"method":"POST"');
    expect(text).toContain('/races/ABCDEF/heartbeat');
    expect(text).toContain('http.res');
    expect(text).toContain('"status":200');
  });

  it('records a network failure as an error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(request('GET', '/races/ABCDEF', undefined, undefined, fetchImpl as any)).rejects.toBeInstanceOf(ApiError);

    const text = readLog();
    expect(text).toContain('ERROR http.err');
    expect(text).toContain('ECONNREFUSED');
  });

  it('never writes the identity token or the horse auth token', async () => {
    await saveIdentity({
      user_id: 'u-1', display_name: 'Tester', secret_token: 'SUPER_SECRET_TOKEN',
      created_at: '2026-01-01T00:00:00Z',
    } as any);
    _resetIdentityCacheForTests();

    await request('POST', '/races/ABCDEF/heartbeat', { seq: 1 }, 'HORSE_AUTH_TOKEN', fakeFetch(200, { ok: true }) as any);

    const text = readLog();
    expect(text).not.toContain('SUPER_SECRET_TOKEN');
    expect(text).not.toContain('HORSE_AUTH_TOKEN');
  });
});

describe('api client path scrubbing', () => {
  it('masks a claim token carried in the URL path', async () => {
    await request('GET', '/claims/SUPER_SECRET_CLAIM', undefined, undefined, fakeFetch(200, {}) as any);

    const text = readLog();
    expect(text).not.toContain('SUPER_SECRET_CLAIM');
    expect(text).toContain('/claims/[redacted]');
  });

  it('masks an admin code carried in the URL path', async () => {
    await request('POST', '/races/admin/ADMIN_CODE_XYZ/end', undefined, undefined, fakeFetch(200, {}) as any);

    const text = readLog();
    expect(text).not.toContain('ADMIN_CODE_XYZ');
    expect(text).toContain('/races/admin/[redacted]');
  });

  it('keeps a join code, which is shareable and worth having when debugging', async () => {
    await request('GET', '/races/ABCDEF', undefined, undefined, fakeFetch(200, {}) as any);

    expect(readLog()).toContain('/races/ABCDEF');
  });
});
