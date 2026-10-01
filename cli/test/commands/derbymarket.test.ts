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
  const spawn = () => vi.fn(() => ({ on: () => {}, unref: () => {} })) as any;
  const fetchWith = (race?: unknown) => vi.fn(async (url: any) => {
    if (String(url).endsWith('/web-sessions')) return ok({ code: 'CODE123' });
    if (race && String(url).endsWith('/races/Q79KSH')) return ok(race);
    throw new Error(`unexpected ${url}`);
  });

  it('opens the market picker when the player has no active race', async () => {
    (globalThis as any).fetch = fetchWith();
    const spawnImpl = spawn();
    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    expect(await derbymarketCommand({ spawnImpl })).toBe(0);
    expect(logs.join('\n')).toContain('https://example.test/?host=market#code=CODE123');
  });

  it("opens the player's race under its organisation", async () => {
    (globalThis as any).fetch = fetchWith({ join_code: 'Q79KSH', organisation_name: 'StackOne' });
    const { saveActiveRace } = await import('../../src/stable/active-race.js');
    await saveActiveRace({ join_code: 'Q79KSH' } as any);
    const spawnImpl = spawn();
    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    expect(await derbymarketCommand({ spawnImpl })).toBe(0);
    expect(logs.join('\n')).toContain('https://example.test/StackOne/Q79KSH?host=market#code=CODE123');
    expect(JSON.stringify(spawnImpl.mock.calls[0])).toContain('/StackOne/Q79KSH');
  });

  it('falls back to the picker when the race lookup fails', async () => {
    (globalThis as any).fetch = fetchWith();
    const { saveActiveRace } = await import('../../src/stable/active-race.js');
    await saveActiveRace({ join_code: 'Q79KSH' } as any);
    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    expect(await derbymarketCommand({ spawnImpl: spawn() })).toBe(0);
    expect(logs.join('\n')).toContain('https://example.test/?host=market#code=CODE123');
  });

  it('still returns 0 when there is no opener, having printed the URL', async () => {
    (globalThis as any).fetch = fetchWith();
    const spawnImpl = vi.fn(() => { throw new Error('no opener'); }) as any;
    const { derbymarketCommand } = await import('../../src/commands/derbymarket.js');
    expect(await derbymarketCommand({ spawnImpl })).toBe(0);
  });
});

describe('marketOrigin', () => {
  it('is the market host without an API override', async () => {
    delete process.env.TOKEN_DERBY_API_BASE;
    const { marketOrigin } = await import('../../src/commands/open-web.js');
    expect(marketOrigin()).toBe('https://market.tokenderby.co.uk');
  });
});
