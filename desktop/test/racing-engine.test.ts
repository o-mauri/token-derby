import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs, mkdirSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { DesktopActiveRace } from '../electron/racing/active-race.js';

// Real transport goes over the network; substitute a stubbed api surface
// (getRace/joinRace/heartbeat) while keeping the real ApiError class, which
// engine.ts checks via `instanceof` for the fatal VERSION_MISMATCH path.
const mockCreateEndpoints = vi.fn();
vi.mock('@token-derby/client', async (orig) => ({
  ...(await orig<typeof import('@token-derby/client')>()),
  createTransport: vi.fn(() => ({})),
  createEndpoints: mockCreateEndpoints,
}));

// readAllSources defaults to the REAL implementation (a passthrough set in
// beforeEach) so every existing fixture-transcript-dir test is unaffected;
// the pending-window regression test below overrides it with an exact,
// per-call sequence to avoid racing real fs timing against several ticks.
const mockReadAllSources = vi.fn();
vi.mock('@token-derby/token-engine', async (orig) => ({
  ...(await orig<typeof import('@token-derby/token-engine')>()),
  readAllSources: mockReadAllSources,
}));

const { DEFAULT_CONFIG } = await import('../electron/config.js');
const { applyTranscriptDirs } = await import('../electron/racing/transcripts.js');
const { loadActiveRace } = await import('../electron/racing/active-race.js');
const engine = await import('../electron/racing/engine.js');
const actualTokenEngine = await vi.importActual<typeof import('@token-derby/token-engine')>('@token-derby/token-engine');

let tmpHome: string;
let claudeDir: string;
let stubApi: { getRace: ReturnType<typeof vi.fn>; joinRace: ReturnType<typeof vi.fn>; heartbeat: ReturnType<typeof vi.fn> };

function horseFixture(overrides: Record<string, unknown> = {}) {
  return {
    horse_id: 'horse-1',
    stable_horse_id: 'stable-1',
    name: 'Thunder',
    colors: { body: '#111', mane: '#222', tail: '#333', saddle: '#444' },
    current_tokens: 0,
    last_heartbeat: new Date(0).toISOString(),
    joined_at: new Date().toISOString(),
    user_id: 'u1',
    user_name: 'Alice',
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
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-engine-'));
  process.env.TOKEN_DERBY_DESKTOP_HOME = tmpHome;
  // Not overriding TOKEN_DERBY_HEARTBEAT_INTERVAL_MS here: runHeartbeatLoop
  // always fires its *first* beat immediately (schedule(0)) regardless of
  // intervalMs — the override only shortens the gap *between* beats, which
  // most tests below don't need. One dedicated test further down exercises
  // the override directly.

  // Deliberately not created yet — readAllSources treats a missing
  // transcript dir as "0 tokens so far", matching a fresh join.
  claudeDir = path.join(tmpHome, 'claude-projects');
  applyTranscriptDirs({ ...DEFAULT_CONFIG, claudeDir } as any);

  stubApi = { getRace: vi.fn(), joinRace: vi.fn(), heartbeat: vi.fn() };
  mockCreateEndpoints.mockReturnValue(stubApi);
  mockReadAllSources.mockImplementation(actualTokenEngine.readAllSources);
});

afterEach(async () => {
  await engine.stopRace();
  applyTranscriptDirs(DEFAULT_CONFIG);
  delete process.env.TOKEN_DERBY_DESKTOP_HOME;
  delete process.env.TOKEN_DERBY_HEARTBEAT_INTERVAL_MS;
  await fs.rm(tmpHome, { recursive: true, force: true });
  vi.clearAllMocks();
});

// Writes one claude transcript conversation with the given output-token
// count, in the shape sumTokensByConversation() expects:
// <root>/<project>/<session>.jsonl. Deliberately synchronous: the heartbeat
// loop's first tick is scheduled via setTimeout(fn, 0), a macrotask that
// only runs once the current microtask chain (our test's `await` on
// startRace(), including its own real fs writes) fully drains. A sync write
// here happens entirely within that same microtask-only execution, so it's
// guaranteed to land before the loop's first read — no timing race against
// the scheduled tick.
function writeClaudeTranscript(outputTokens: number): void {
  const projectDir = path.join(claudeDir, 'proj-a');
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    path.join(projectDir, 'session-1.jsonl'),
    JSON.stringify({ message: { usage: { output_tokens: outputTokens, input_tokens: 0 } } }) + '\n',
    'utf8',
  );
}

describe('startRace', () => {
  it('joins, ticks a heartbeat reflecting fixture tokens, and persists an advanced score.seq', async () => {
    stubApi.getRace
      .mockResolvedValueOnce(raceFixture({ horses: [] })) // pre-join: soft-guard read, horse not present yet
      .mockResolvedValueOnce(raceFixture({ horses: [horseFixture()] })); // post-join: horse now present

    stubApi.joinRace.mockResolvedValue({ horse_id: 'horse-1', heartbeat_token: 'hb-token', primary_model: 'claude' });

    stubApi.heartbeat.mockImplementation(async (_joinCode: string, _horseId: string, _token: string, body: any) => ({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: body.seq,
      horses: [horseFixture({ current_tokens: body.components.claude, last_seq: body.seq })],
      race: raceFixture(),
    }));

    const result = await engine.startRace('abc123', 'stable-1', 'claude');
    expect(result).toEqual({ started: true });
    expect(stubApi.joinRace).toHaveBeenCalledWith('ABC123', { stable_horse_id: 'stable-1', primary_model: 'claude' });

    // Score anchors are seeded from a scan taken before this write, so this
    // models tokens produced *after* joining — exactly what should show up
    // as the beat's delta.
    writeClaudeTranscript(42);

    await vi.waitFor(() => expect(stubApi.heartbeat).toHaveBeenCalledTimes(1), { timeout: 2000 });

    const [, , , body] = stubApi.heartbeat.mock.calls[0]!;
    expect(body.components.claude).toBe(42);
    expect(body.seq).toBe(1);

    await vi.waitFor(async () => {
      const saved = await loadActiveRace();
      expect(saved?.score.seq).toBe(1);
    }, { timeout: 2000 });

    const saved = (await loadActiveRace()) as DesktopActiveRace;
    expect(saved.join_code).toBe('ABC123');
    expect(saved.horse_id).toBe('horse-1');
    expect(saved.heartbeat_token).toBe('hb-token');
    expect(saved.score.primaryCounted).toBe(42);

    const status = await engine.getActiveRace();
    expect(status).toMatchObject({ joinCode: 'ABC123', horseId: 'horse-1', tokens: 42, rank: 1, status: 'live' });
  });

  it('soft guard returns needsConfirm without joining when the horse heartbeated recently', async () => {
    stubApi.getRace.mockResolvedValue(
      raceFixture({
        horses: [horseFixture({ last_heartbeat: new Date(Date.now() - 5_000).toISOString() })],
      }),
    );

    const result = await engine.startRace('abc123', 'stable-1', 'claude');

    expect(result).toEqual({ started: false, needsConfirm: true });
    expect(stubApi.joinRace).not.toHaveBeenCalled();
  });

  it('confirm:true bypasses the soft guard even with a recent heartbeat', async () => {
    stubApi.getRace.mockResolvedValue(
      raceFixture({ horses: [horseFixture({ last_heartbeat: new Date(Date.now() - 5_000).toISOString() })] }),
    );
    stubApi.joinRace.mockResolvedValue({ horse_id: 'horse-1', heartbeat_token: 'hb-token', primary_model: 'claude' });
    stubApi.heartbeat.mockResolvedValue({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: 1,
      horses: [horseFixture()],
      race: raceFixture(),
    });

    const result = await engine.startRace('abc123', 'stable-1', 'claude', { confirm: true });

    expect(result).toEqual({ started: true });
    expect(stubApi.joinRace).toHaveBeenCalledOnce();
  });

  it('a fresh startRace call stops any previously running loop first', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture()] }));
    stubApi.joinRace
      .mockResolvedValueOnce({ horse_id: 'horse-1', heartbeat_token: 'hb-token-1', primary_model: 'claude' })
      .mockResolvedValueOnce({ horse_id: 'horse-2', heartbeat_token: 'hb-token-2', primary_model: 'claude' });
    stubApi.heartbeat.mockImplementation(async (_joinCode: string, _horseId: string, _token: string, body: any) => ({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: body.seq,
      horses: [horseFixture()],
      race: raceFixture(),
    }));

    await engine.startRace('abc123', 'stable-1', 'claude', { confirm: true });
    await engine.startRace('def456', 'stable-2', 'claude', { confirm: true });

    const saved = (await loadActiveRace()) as DesktopActiveRace;
    expect(saved.horse_id).toBe('horse-2');
    expect(saved.heartbeat_token).toBe('hb-token-2');
  });
});

describe('stopRace', () => {
  it('clears the persisted active race and status', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture()] }));
    stubApi.joinRace.mockResolvedValue({ horse_id: 'horse-1', heartbeat_token: 'hb-token', primary_model: 'claude' });
    stubApi.heartbeat.mockResolvedValue({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: 1,
      horses: [horseFixture()],
      race: raceFixture(),
    });

    await engine.startRace('abc123', 'stable-1', 'claude', { confirm: true });
    expect(await loadActiveRace()).not.toBeNull();

    const result = await engine.stopRace();

    expect(result).toEqual({ ok: true });
    expect(await loadActiveRace()).toBeNull();
    expect(await engine.getActiveRace()).toBeNull();
  });
});

describe('resumeIfActive', () => {
  it('does nothing when no active race is persisted', async () => {
    await engine.resumeIfActive();
    expect(stubApi.getRace).not.toHaveBeenCalled();
  });

  it('rebuilds the tracker from the persisted score and resumes heartbeating', async () => {
    const { saveActiveRace } = await import('../electron/racing/active-race.js');
    const persisted: DesktopActiveRace = {
      join_code: 'ABC123',
      race_id: 'race-1',
      horse_id: 'horse-1',
      heartbeat_token: 'hb-token',
      horse_name: 'Thunder',
      primary_model: 'claude',
      counts_input: false,
      primary_top5: false,
      score: {
        acked: { claude: 0, codex: 0, gemini: 0 },
        lastGood: { claude: 0, codex: 0, gemini: 0 },
        primaryConvAcked: {},
        primaryCounted: 0,
        seq: 3,
      },
      last_heartbeat_at: new Date(0).toISOString(),
    };
    await saveActiveRace(persisted);

    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture({ last_seq: 3 })] }));
    stubApi.heartbeat.mockImplementation(async (_joinCode: string, _horseId: string, _token: string, body: any) => ({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: body.seq,
      horses: [horseFixture()],
      race: raceFixture(),
    }));

    await engine.resumeIfActive();

    await vi.waitFor(() => expect(stubApi.heartbeat).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(stubApi.heartbeat.mock.calls[0]![2]).toBe('hb-token');
  });

  it('clears the persisted file and does not restart the loop when the race already finished', async () => {
    const { saveActiveRace } = await import('../electron/racing/active-race.js');
    await saveActiveRace({
      join_code: 'ABC123',
      race_id: 'race-1',
      horse_id: 'horse-1',
      heartbeat_token: 'hb-token',
      horse_name: 'Thunder',
      primary_model: 'claude',
      score: {
        acked: { claude: 0, codex: 0, gemini: 0 },
        lastGood: { claude: 0, codex: 0, gemini: 0 },
        primaryConvAcked: {},
        primaryCounted: 0,
        seq: 3,
      },
      last_heartbeat_at: new Date(0).toISOString(),
    });
    stubApi.getRace.mockResolvedValue(raceFixture({ status: 'finished' }));

    await engine.resumeIfActive();

    expect(await loadActiveRace()).toBeNull();
    expect(stubApi.heartbeat).not.toHaveBeenCalled();
  });
});

// Regression: CRITICAL 1 from the B3 review. The old code flipped the local
// `pending` flag to false on the first non-stall LOCAL read, independent of
// what the server actually reported — so a race sitting `pending` for
// several heartbeats (joined before start_time) would count real growth
// from the second beat onward, defeating the guard. The fix: `pending` only
// clears once a response reports the SERVER's race_status as 'live', and the
// tracker reprimes on every tick while still pending, not just the first.
describe('pending-window guard (CRITICAL 1 regression)', () => {
  it('reprimes every tick while the server still reports pending, and only counts growth once it reports live', async () => {
    process.env.TOKEN_DERBY_HEARTBEAT_INTERVAL_MS = '2';

    stubApi.getRace
      .mockResolvedValueOnce(raceFixture({ horses: [], status: 'pending' })) // pre-join (soft guard)
      .mockResolvedValueOnce(raceFixture({ horses: [horseFixture()], status: 'pending' })); // post-join

    stubApi.joinRace.mockResolvedValue({ horse_id: 'horse-1', heartbeat_token: 'hb-token', primary_model: 'claude' });

    // Local reads: 0 at join, then growing across ticks while the server
    // still says pending (30 → 55 → 60), then more growth (60 → 90) once the
    // server has reported live. A steady 90 covers any further ticks.
    const reading = (tokens: number) => ({
      secondary: { claude: 0, codex: 0, gemini: 0 },
      primaryByConv: new Map([['proj/conv', tokens]]),
    });
    mockReadAllSources
      .mockResolvedValueOnce(reading(0)) // join-time anchor scan
      .mockResolvedValueOnce(reading(30)) // tick A (pending)
      .mockResolvedValueOnce(reading(55)) // tick B (still pending — this is where the old bug counted 25)
      .mockResolvedValueOnce(reading(60)) // tick C (still pending when prepared; server flips to live in its response)
      .mockResolvedValueOnce(reading(90)) // tick D (pending cleared — real growth now counted)
      .mockResolvedValue(reading(90)); // steady state for any further ticks

    let heartbeatCall = 0;
    stubApi.heartbeat.mockImplementation(async (_joinCode: string, _horseId: string, _token: string, body: any) => {
      heartbeatCall += 1;
      const race_status = heartbeatCall < 3 ? 'pending' : 'live';
      return {
        race_status,
        server_time: new Date().toISOString(),
        time_left_seconds: 90,
        last_seq: body.seq,
        horses: [horseFixture({ current_tokens: body.components.claude })],
        race: raceFixture({ status: race_status }),
      };
    });

    await engine.startRace('abc123', 'stable-1', 'claude');

    await vi.waitFor(() => expect(stubApi.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(4), { timeout: 2000 });

    const componentsAt = (i: number) => stubApi.heartbeat.mock.calls[i]![3].components.claude;
    expect(componentsAt(0)).toBe(0); // tick A: reprimed
    expect(componentsAt(1)).toBe(0); // tick B: still pending — reprimed again (the regression)
    expect(componentsAt(2)).toBe(0); // tick C: still pending when prepared — reprimed again
    expect(componentsAt(3)).toBe(30); // tick D: pending cleared last beat — real delta (90-60) counted

    await engine.stopRace();
  });
});

// Regression: CRITICAL 2 from the B3 review. runHeartbeatLoop's abortSignal
// only prevents FUTURE scheduling — a tick already in flight when
// stopLoop()/stopRace() runs still resolves and previously fired onSuccess
// against a race that's no longer current, re-persisting active-race.json
// and re-emitting a live status after Stop (or clobbering a swapped-in race).
// The fix checks `controller === ctrl` at the top of every callback.
describe('stale in-flight loop (CRITICAL 2 regression)', () => {
  it('a heartbeat response that resolves after stopRace() does not resurrect the race', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture()] }));
    stubApi.joinRace.mockResolvedValue({ horse_id: 'horse-1', heartbeat_token: 'hb-token', primary_model: 'claude' });

    let resolveHeartbeat!: (value: unknown) => void;
    stubApi.heartbeat.mockImplementation(() => new Promise((resolve) => { resolveHeartbeat = resolve; }));

    await engine.startRace('abc123', 'stable-1', 'claude', { confirm: true });
    expect(await loadActiveRace()).not.toBeNull();

    await vi.waitFor(() => expect(stubApi.heartbeat).toHaveBeenCalledTimes(1), { timeout: 2000 });

    const stopResult = await engine.stopRace();
    expect(stopResult).toEqual({ ok: true });
    expect(await loadActiveRace()).toBeNull();
    expect(await engine.getActiveRace()).toBeNull();

    // The in-flight request finally resolves *after* stop — must be a no-op.
    resolveHeartbeat({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: 1,
      horses: [horseFixture({ current_tokens: 999 })],
      race: raceFixture(),
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(await loadActiveRace()).toBeNull(); // not re-persisted
    expect(await engine.getActiveRace()).toBeNull(); // status not re-emitted
  });

  it('a heartbeat response from a race superseded by a startRace swap does not overwrite the new race', async () => {
    stubApi.getRace.mockResolvedValue(raceFixture({ horses: [horseFixture()] }));
    stubApi.joinRace
      .mockResolvedValueOnce({ horse_id: 'horse-1', heartbeat_token: 'hb-token-1', primary_model: 'claude' })
      .mockResolvedValueOnce({ horse_id: 'horse-2', heartbeat_token: 'hb-token-2', primary_model: 'claude' });

    let resolveFirstHeartbeat!: (value: unknown) => void;
    stubApi.heartbeat
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstHeartbeat = resolve; }))
      .mockImplementation(async (_joinCode: string, _horseId: string, _token: string, body: any) => ({
        race_status: 'live',
        server_time: new Date().toISOString(),
        time_left_seconds: 90,
        last_seq: body.seq,
        horses: [horseFixture({ horse_id: 'horse-2' })],
        race: raceFixture({ join_code: 'DEF456' }),
      }));

    await engine.startRace('abc123', 'stable-1', 'claude', { confirm: true });
    await vi.waitFor(() => expect(stubApi.heartbeat).toHaveBeenCalledTimes(1), { timeout: 2000 });

    // Swap to a different race while the first one's heartbeat is still in flight.
    await engine.startRace('def456', 'stable-2', 'claude', { confirm: true });
    const afterSwap = (await loadActiveRace()) as DesktopActiveRace;
    expect(afterSwap.horse_id).toBe('horse-2');

    // The superseded race's late response resolves now — must not clobber horse-2's state.
    resolveFirstHeartbeat({
      race_status: 'live',
      server_time: new Date().toISOString(),
      time_left_seconds: 90,
      last_seq: 999,
      horses: [horseFixture({ horse_id: 'horse-1' })],
      race: raceFixture({ join_code: 'ABC123' }),
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const after = (await loadActiveRace()) as DesktopActiveRace;
    expect(after.horse_id).toBe('horse-2');
    expect(after.join_code).toBe('DEF456');

    const status = await engine.getActiveRace();
    expect(status?.horseId).toBe('horse-2');
  });
});
