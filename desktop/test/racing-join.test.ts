import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Real safeStorage/app aren't available outside the Electron runtime.
// safeStorage gets a reversible passthrough so a real identity file can be
// written and read back; app.getVersion feeds the client-version header.
vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0-test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8'),
  },
}));

const mockCreateEndpoints = vi.fn();
vi.mock('@token-derby/client', async (orig) => ({
  ...(await orig<typeof import('@token-derby/client')>()),
  createTransport: vi.fn(() => ({})),
  createEndpoints: mockCreateEndpoints,
}));

// A resumed race starts heartbeating, which scans transcripts. Pin the scan to
// a fixed zero reading so these tests exercise the join decision, not the fs.
const mockReadAllSources = vi.fn();
vi.mock('@token-derby/token-engine', async (orig) => ({
  ...(await orig<typeof import('@token-derby/token-engine')>()),
  readAllSources: mockReadAllSources,
}));

const { DEFAULT_CONFIG, saveConfig, loadConfig } = await import('../electron/config.js');
const { applyEngineConfig } = await import('../electron/racing/engine-config.js');
const { loadActiveRace } = await import('../electron/racing/active-race.js');
const identityStore = await import('../electron/identity.js');
const engine = await import('../electron/racing/engine.js');

let tmpHome: string;
let stubApi: {
  getRace: ReturnType<typeof vi.fn>;
  joinRace: ReturnType<typeof vi.fn>;
  heartbeat: ReturnType<typeof vi.fn>;
};

const ME = 'u-me';

function horseFixture(overrides: Record<string, unknown> = {}) {
  return {
    horse_id: 'horse-1',
    stable_horse_id: 'stable-1',
    name: 'Thunder',
    colors: { body: '#111', mane: '#222', tail: '#333', saddle: '#444' },
    current_tokens: 0,
    last_heartbeat: new Date(0).toISOString(),
    joined_at: new Date().toISOString(),
    user_id: ME,
    user_name: 'Me',
    xp: 0,
    rank: 1,
    last_seq: 0,
    ...overrides,
  };
}

function raceFixture(overrides: Record<string, unknown> = {}) {
  return {
    race_id: 'race-1',
    join_code: 'ABC123',
    name: 'Test Race',
    start_time: '',
    end_time: '',
    tz: 'UTC',
    max_participants: 10,
    created_at: '',
    status: 'live',
    horses: [],
    server_time: new Date().toISOString(),
    time_left_seconds: 100,
    counts_input: false,
    primary_top5: false,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-join-'));
  process.env.TOKEN_DERBY_DESKTOP_HOME = tmpHome;
  saveConfig({ claudeDir: path.join(tmpHome, 'claude-projects') });
  applyEngineConfig(loadConfig());

  await identityStore.store(loadConfig(), {
    user_id: ME,
    display_name: 'Me',
    secret_token: 'secret',
  });

  stubApi = { getRace: vi.fn(), joinRace: vi.fn(), heartbeat: vi.fn() };
  mockCreateEndpoints.mockReturnValue(stubApi);
  mockReadAllSources.mockResolvedValue({
    secondary: { claude: 0, codex: 0, gemini: 0 },
    primaryByConv: new Map(),
  });
  stubApi.heartbeat.mockResolvedValue({
    race_status: 'live',
    server_time: new Date().toISOString(),
    time_left_seconds: 90,
    last_seq: 1,
    horses: [horseFixture()],
    race: raceFixture(),
  });
});

afterEach(async () => {
  await engine.stopRace();
  applyEngineConfig(DEFAULT_CONFIG);
  delete process.env.TOKEN_DERBY_DESKTOP_HOME;
  // A resumed race may still be finishing a beat whose scan-cache save
  // re-creates <home>/scan-cache mid-delete; retry instead of failing the run.
  await fs.rm(tmpHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  vi.clearAllMocks();
});

describe('engine.joinRace', () => {
  it('asks for a horse when the jockey has none in this race', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture({ user_id: 'someone-else' })] }));

    const result = await engine.joinRace('ABC123');

    expect(result).toEqual({ needsHorse: true });
    expect(stubApi.joinRace).not.toHaveBeenCalled();
    expect(await loadActiveRace()).toBeNull();
  });

  it('resumes without a picker when the jockey is already in the race', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture()] }));
    stubApi.joinRace.mockResolvedValue({
      horse_id: 'horse-1',
      heartbeat_token: 'rotated-token',
      primary_model: 'codex',
    });

    const result = await engine.joinRace('ABC123');

    expect(result).toEqual({ resumed: true });
    const active = await loadActiveRace();
    expect(active?.horse_id).toBe('horse-1');
    expect(active?.heartbeat_token).toBe('rotated-token');
    // The server's stored model for this race-horse wins — the desktop never
    // asks, so it must not substitute a default of its own.
    expect(active?.primary_model).toBe('codex');
  });

  it('rejoins as the horse already in the race, not some other stable entry', async () => {
    stubApi.getRace.mockResolvedValue(
      raceFixture({ horses: [horseFixture({ stable_horse_id: 'stable-in-race' })] }),
    );
    stubApi.joinRace.mockResolvedValue({
      horse_id: 'horse-1',
      heartbeat_token: 'rotated-token',
      primary_model: 'claude',
    });

    await engine.joinRace('ABC123');

    expect(stubApi.joinRace).toHaveBeenCalledWith(
      'ABC123',
      expect.objectContaining({ stable_horse_id: 'stable-in-race' }),
    );
  });

  it('asks before taking over a horse that is still being raced elsewhere', async () => {
    stubApi.getRace.mockResolvedValue(
      raceFixture({ horses: [horseFixture({ last_heartbeat: new Date().toISOString() })] }),
    );

    const result = await engine.joinRace('ABC123');

    expect(result).toEqual({ needsConfirm: true, horseName: 'Thunder' });
    expect(stubApi.joinRace).not.toHaveBeenCalled();
    expect(await loadActiveRace()).toBeNull();
  });

  it('resumes a horse racing elsewhere once confirmed', async () => {
    stubApi.getRace.mockResolvedValue(
      raceFixture({ horses: [horseFixture({ last_heartbeat: new Date().toISOString() })] }),
    );
    stubApi.joinRace.mockResolvedValue({
      horse_id: 'horse-1',
      heartbeat_token: 'rotated-token',
      primary_model: 'claude',
    });

    const result = await engine.joinRace('ABC123', { confirm: true });

    expect(result).toEqual({ resumed: true });
    expect((await loadActiveRace())?.heartbeat_token).toBe('rotated-token');
  });

  it('refuses to join a race that has already finished', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ status: 'finished', horses: [horseFixture()] }));

    await expect(engine.joinRace('ABC123')).rejects.toThrow(/finished|ended/i);
    expect(stubApi.joinRace).not.toHaveBeenCalled();
  });

  it('uppercases the join code before asking the server', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [] }));

    await engine.joinRace('abc123');

    expect(stubApi.getRace).toHaveBeenCalledWith('ABC123');
  });
});
