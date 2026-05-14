import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// Module-scope mock — Vitest hoists this before imports
vi.mock('../../src/api/endpoints.js', () => ({
  spendToken: vi.fn().mockResolvedValue({ ok: true }),
}));

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-roll-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('rollCommand', () => {
  it('returns 2 with usage when join_code is missing', async () => {
    const { rollCommand } = await import('../../src/commands/roll.js');
    const code = await rollCommand(undefined);
    expect(code).toBe(2);
  });

  it('returns 1 when no active race file exists for that join_code', async () => {
    const { rollCommand } = await import('../../src/commands/roll.js');
    const code = await rollCommand('NO_SUCH_CODE');
    expect(code).toBe(1);
  });

  it('saves a new hat to the stable horse after a successful spend', async () => {
    const { spendToken } = await import('../../src/api/endpoints.js');
    const activeDir = path.join(tmp, 'active-races');
    await fs.mkdir(activeDir, { recursive: true });
    const activeRace = {
      join_code: 'TESTJOIN',
      race_id: 'r1',
      horse_id: 'h1',
      heartbeat_token: 'tok',
      horse_name: 'Gary',
      horse_colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
      joined_at: '2026-05-14T00:00:00Z',
      last_race_tokens: 100,
      last_heartbeat_at: '2026-05-14T01:00:00Z',
    };
    await fs.writeFile(path.join(activeDir, 'TESTJOIN.json'), JSON.stringify(activeRace));
    await fs.writeFile(
      path.join(tmp, 'stable.json'),
      JSON.stringify({ horses: [{ name: 'Gary', colors: activeRace.horse_colors, created_at: '2026-05-14T00:00:00Z', hats: [] }] }),
    );

    const { rollCommand } = await import('../../src/commands/roll.js');
    const code = await rollCommand('TESTJOIN', { skipPrompt: true });
    expect(code).toBe(0);

    expect(vi.mocked(spendToken)).toHaveBeenCalledWith('TESTJOIN', 'h1', 'tok');

    const stable = JSON.parse(await fs.readFile(path.join(tmp, 'stable.json'), 'utf8'));
    expect(stable.horses[0].hats).toHaveLength(1);
  });

  it('creates a stable entry if the horse was deleted from the stable', async () => {
    const activeDir = path.join(tmp, 'active-races');
    await fs.mkdir(activeDir, { recursive: true });
    const activeRace = {
      join_code: 'ORPHAN',
      race_id: 'r2',
      horse_id: 'h2',
      heartbeat_token: 'tok',
      horse_name: 'Phantom',
      horse_colors: { body: '#123', mane: '#456', tail: '#789', saddle: '#abc' },
      joined_at: '2026-05-14T00:00:00Z',
      last_race_tokens: 50,
      last_heartbeat_at: '2026-05-14T01:00:00Z',
    };
    await fs.writeFile(path.join(activeDir, 'ORPHAN.json'), JSON.stringify(activeRace));
    // Intentionally no stable.json — horse was deleted

    const { rollCommand } = await import('../../src/commands/roll.js');
    const code = await rollCommand('ORPHAN', { skipPrompt: true });
    expect(code).toBe(0);

    const stable = JSON.parse(await fs.readFile(path.join(tmp, 'stable.json'), 'utf8'));
    const phantom = stable.horses.find((h: any) => h.name === 'Phantom');
    expect(phantom).toBeDefined();
    expect(phantom.hats).toHaveLength(1);
  });
});
