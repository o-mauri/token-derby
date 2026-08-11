import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { saveIdentity } from '../../src/identity/identity.js';
import { _resetIdentityCacheForTests } from '../../src/api/client.js';

let tmp: string;
let logs: string[] = [];
let origLog: typeof console.log;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-derbymarket-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
  _resetIdentityCacheForTests();
  logs = [];
  origLog = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  await saveIdentity({
    user_id: '12345678-1234-1234-1234-123456789012',
    display_name: 'Owner', secret_token: 's', created_at: '2026-05-14T10:00:00Z',
  });
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  delete process.env.TOKEN_DERBY_API_BASE;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetIdentityCacheForTests();
  console.log = origLog;
});

function ok(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body) };
}

describe('derbymarketCommand', () => {
  it('mints a code, builds the /derbymarket URL, prints and opens it', async () => {
    (globalThis as any).fetch = vi.fn(async (url: any) => {
      if (String(url).endsWith('/web-sessions')) return ok({ code: 'CODE123' });
      throw new Error(`unexpected ${url}`);
    });
    const spawnImpl = vi.fn(() => ({ on: () => {}, unref: () => {} })) as any;

    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    const rc = await derbymarketCommand({ spawnImpl });

    expect(rc).toBe(0);
    const out = logs.join('\n');
    expect(out).toContain('https://example.test/derbymarket#code=CODE123');
    expect(spawnImpl).toHaveBeenCalled();
    const args = spawnImpl.mock.calls[0];
    expect(JSON.stringify(args)).toContain('https://example.test/derbymarket#code=CODE123');
  });

  it('still returns 0 when there is no opener, having printed the URL', async () => {
    (globalThis as any).fetch = vi.fn(async (url: any) => {
      if (String(url).endsWith('/web-sessions')) return ok({ code: 'CODE123' });
      throw new Error(`unexpected ${url}`);
    });
    const spawnImpl = vi.fn(() => { throw new Error('no opener'); }) as any;

    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    expect(await derbymarketCommand({ spawnImpl })).toBe(0);
  });
});
