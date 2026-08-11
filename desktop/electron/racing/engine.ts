import { app } from 'electron';
import { createTransport, createEndpoints, ApiError } from '@token-derby/client';
import {
  RaceScoreTracker,
  readAllSources,
  isStall,
  runHeartbeatLoop,
  scanWithTimeout,
  ScanProgress,
  diagnoseScanTimeout,
  RACING_COMPAT_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_RETRY_DELAYS_MS,
  SCAN_TIMEOUT_MS,
  type RaceScoreState,
  type BeatReading,
} from '@token-derby/token-engine';
import type { GetRaceResponse, ModelKey } from '@token-derby/shared';
import { loadConfig, resolveApiBase } from '../config.js';
import * as identityStore from '../identity.js';
import { loadActiveRace, saveActiveRace, clearActiveRace, type DesktopActiveRace } from './active-race.js';
import { applyEngineConfig } from './engine-config.js';
import { deriveStatus } from './status.js';
import type { ActiveRaceStatus, JoinRaceResult } from '../ipc.js';

// The desktop app races one horse at a time, on the engine's shared cadence and
// retry backoff so it can't drift from the CLI's.
const DEFAULT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;

// Soft guard: a horse whose last heartbeat lands inside two beat intervals of
// "now" is probably already being raced elsewhere (another device/process
// for the same jockey) — starting a second loop would double-count tokens.
const SOFT_GUARD_WINDOW_MS = 2 * DEFAULT_INTERVAL_MS;

// An unbounded readAllSources() would freeze the whole loop on a hung read
// (prepareBeat never resolves, so the loop never reaches sendBeat/onError).
// The engine's scanWithTimeout degrades that to a stall naming whichever source
// was still scanning when the budget expired.
async function scanBeat(race: { counts_input?: boolean }, primary: ModelKey): Promise<BeatReading> {
  const progress = new ScanProgress();
  try {
    return await scanWithTimeout(
      () => readAllSources(race, primary, progress),
      SCAN_TIMEOUT_MS,
      () => diagnoseScanTimeout(SCAN_TIMEOUT_MS, progress),
    );
  } catch (e: any) {
    return { stall: `Token scan failed: ${e?.message ?? String(e)}` };
  }
}

// Tests set TOKEN_DERBY_HEARTBEAT_INTERVAL_MS=0 to tick the loop synchronously
// instead of waiting on a real 60s timer, matching the TOKEN_DERBY_* env-hook
// pattern the rest of the desktop app already uses for test overrides.
function heartbeatIntervalMs(): number {
  const override = process.env.TOKEN_DERBY_HEARTBEAT_INTERVAL_MS;
  if (override !== undefined) {
    const n = Number(override);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_INTERVAL_MS;
}

function getClientVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0-dev';
  }
}

// A self-built transport (rather than reusing services/api.ts's) keeps the
// racing engine free of a circular import with the IPC service layer that
// delegates to it, and keeps this module trivially mockable in tests via
// `vi.mock('@token-derby/client', ...)`.
function buildApi() {
  return createEndpoints(
    createTransport({
      baseUrl: () => resolveApiBase(loadConfig()),
      client: 'desktop',
      clientVersion: getClientVersion(),
      raceCompatVersion: RACING_COMPAT_VERSION,
      getIdentity: async () => {
        const id = await identityStore.load(loadConfig());
        return id ? { user_id: id.user_id, secret_token: id.secret_token } : null;
      },
    }),
  );
}

type RacingApi = ReturnType<typeof buildApi>;

type StatusListener = (status: ActiveRaceStatus | null) => void;
const listeners = new Set<StatusListener>();

// Registers a callback for every racing status change (heartbeat ack, stall,
// finish, stop). Returns an unsubscribe function. main.ts wires this to both
// a renderer push and — later, Task C2 — the tray icon/menu; nothing here
// assumes there's only one subscriber.
export function onStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let lastStatus: ActiveRaceStatus | null = null;

function setStatus(status: ActiveRaceStatus | null): void {
  lastStatus = status;
  for (const cb of listeners) cb(status);
}

// Single active race: one loop, one persisted file. `controller` aborts the
// current runHeartbeatLoop; `tracker`/`current`/`raceName` are the in-memory
// counterparts of what's persisted via active-race.ts.
let controller: AbortController | null = null;
let tracker: RaceScoreTracker | null = null;
let current: DesktopActiveRace | null = null;
let currentRaceName = '';

function stopLoop(): void {
  controller?.abort();
  controller = null;
  tracker = null;
}

// Ports run-race.tsx's buildInitialState: seeds score anchors from a live
// scan so pre-join tokens aren't retroactively counted, but never lets a scan
// failure block the join (falls back to zero anchors).
async function buildInitialState(
  race: { counts_input?: boolean },
  primary: ModelKey,
  serverLastSeq: number,
): Promise<RaceScoreState> {
  let secondary: Record<ModelKey, number> = { claude: 0, codex: 0, gemini: 0 };
  const primaryConvAcked: Record<string, number> = {};
  try {
    const now = await readAllSources(race, primary);
    if (!isStall(now)) {
      secondary = now.secondary;
      for (const [id, v] of now.primaryByConv) primaryConvAcked[id] = v;
    }
  } catch {
    // Leave zeroed anchors — a scan failure at join time shouldn't block joining.
  }
  return {
    acked: { ...secondary },
    lastGood: { ...secondary },
    primaryConvAcked,
    primaryCounted: 0,
    seq: serverLastSeq,
  };
}

// Ports run-race.tsx's beat cycle onto runHeartbeatLoop: read local
// transcripts, fold into the tracker, send the delta, persist + emit status
// on ack. `pendingMode` mirrors the CLI's re-prime-on-go-live behaviour so
// tokens produced before the race goes live aren't credited: reprime EVERY
// tick while pending, and only clear `pending` once a response reports the
// SERVER's race_status as 'live' (never from a local read alone) — a race
// can sit pending for many heartbeats, and each one must anchor away local
// growth, not just the first.
function beginLoop(api: RacingApi, active: DesktopActiveRace, raceTracker: RaceScoreTracker, pendingMode: boolean): void {
  const ctrl = new AbortController();
  controller = ctrl;
  tracker = raceTracker;
  let pending = pendingMode;

  // runHeartbeatLoop's abortSignal only prevents FUTURE scheduling — a tick
  // already in flight when stopLoop() runs (via stopRace() or a startRace
  // swap) still resolves and would otherwise fire these callbacks against a
  // race that's no longer current. Every callback below re-checks that this
  // closure's `ctrl` is still the module's active controller before touching
  // any shared state, so a late response from a superseded loop is a no-op.
  const isCurrentLoop = () => controller === ctrl;

  runHeartbeatLoop({
    prepareBeat: async () => {
      // Re-applied every beat (not just at start) so a transcript-dir
      // override saved in Settings mid-race takes effect on the next tick.
      applyEngineConfig(loadConfig());
      const reading = await scanBeat({ counts_input: active.counts_input }, active.primary_model);
      raceTracker.recordReading(reading);
      if (pending && !isStall(reading)) {
        raceTracker.reprime();
      }
      return raceTracker.nextBeat();
    },
    sendBeat: (snapshot) =>
      api.heartbeat(active.join_code, active.horse_id, active.heartbeat_token, {
        seq: snapshot.seq,
        components: snapshot.components,
      }),
    onSuccess: (resp, snapshot) => {
      if (!isCurrentLoop()) return;
      raceTracker.ack(snapshot, resp.last_seq);
      if (resp.race_status === 'live') pending = false;
      current = {
        ...active,
        score: raceTracker.toState(),
        last_heartbeat_at: new Date().toISOString(),
      };
      void saveActiveRace(current);
      setStatus(deriveStatus(resp, active.horse_id, currentRaceName, raceTracker.stalled));
    },
    onError: (err) => {
      if (!isCurrentLoop()) return;
      // A version mismatch is fatal (the server rejected this CLI's counting
      // rules outright) — stop the loop rather than retrying forever.
      // Anything else is transient and the loop's own backoff handles it;
      // status is left as the last known-good snapshot.
      if (err instanceof ApiError && err.code === 'VERSION_MISMATCH') {
        ctrl.abort();
        void clearActiveRace();
        controller = null;
        tracker = null;
        current = null;
        currentRaceName = '';
        setStatus(null);
      }
    },
    onFinished: () => {
      if (!isCurrentLoop()) return;
      void clearActiveRace();
      const finished = lastStatus ? { ...lastStatus, status: 'finished' as const } : null;
      controller = null;
      tracker = null;
      current = null;
      currentRaceName = '';
      setStatus(finished);
    },
    intervalMs: heartbeatIntervalMs(),
    retryDelaysMs: HEARTBEAT_RETRY_DELAYS_MS,
    abortSignal: ctrl.signal,
  });
}

// Pre-flight for "type a code and join". Decides between resuming whichever
// horse this jockey already has in the race and asking for one, so the caller
// never shows a picker for a race you're already in. Matches on user_id rather
// than stable_horse_id so a horse joined from another machine still counts.
export async function joinRace(joinCode: string, opts?: { confirm?: boolean }): Promise<JoinRaceResult> {
  const code = joinCode.toUpperCase();
  applyEngineConfig(loadConfig());
  const api = buildApi();

  const race: GetRaceResponse = await api.getRace(code);
  if (race.status === 'finished') throw new Error('This race has already finished.');

  const identity = await identityStore.load(loadConfig());
  if (!identity) throw new Error('No jockey identity yet — finish onboarding first.');

  const own = race.horses.find(h => h.user_id === identity.user_id);
  if (!own) return { needsHorse: true };

  // A heartbeat inside the guard window means another process is still racing
  // this horse; resuming silently would double-count its tokens.
  if (!opts?.confirm) {
    const lastHeartbeatMs = new Date(own.last_heartbeat).getTime();
    if (Number.isFinite(lastHeartbeatMs) && Date.now() - lastHeartbeatMs < SOFT_GUARD_WINDOW_MS) {
      return { needsConfirm: true, horseName: own.name };
    }
  }

  // confirm: true — this pre-flight already made the decision, and startRace's
  // own guard keys on stable_horse_id rather than identity.
  await startRace(code, own.stable_horse_id, own.primary_model ?? 'claude', { confirm: true });
  return { resumed: true };
}

export async function startRace(
  joinCode: string,
  stableHorseId: string,
  primaryModel: ModelKey,
  opts?: { confirm?: boolean },
): Promise<{ started: boolean; needsConfirm?: boolean }> {
  const code = joinCode.toUpperCase();
  applyEngineConfig(loadConfig());
  const api = buildApi();

  // Skip the soft-guard round-trip entirely when the caller already confirmed
  // — its only purpose is deciding whether to ask for confirmation.
  if (!opts?.confirm) {
    const preJoinRace: GetRaceResponse = await api.getRace(code);
    const existing = preJoinRace.horses.find(h => h.stable_horse_id === stableHorseId);
    if (existing) {
      const lastHeartbeatMs = new Date(existing.last_heartbeat).getTime();
      if (Number.isFinite(lastHeartbeatMs) && Date.now() - lastHeartbeatMs < SOFT_GUARD_WINDOW_MS) {
        return { started: false, needsConfirm: true };
      }
    }
  }

  // Confirmed (or no conflict) — safe to replace whatever loop is running.
  stopLoop();

  const joinResp = await api.joinRace(code, { stable_horse_id: stableHorseId, primary_model: primaryModel });

  // Re-fetch: the just-joined horse (name, server-assigned last_seq) now
  // appears in the race's horse list.
  const race: GetRaceResponse = await api.getRace(code);
  const ownHorse = race.horses.find(h => h.horse_id === joinResp.horse_id);

  const initialState = await buildInitialState(race, joinResp.primary_model, ownHorse?.last_seq ?? 0);
  const raceTracker = new RaceScoreTracker(initialState, joinResp.primary_model, race.primary_top5 ?? false);

  const active: DesktopActiveRace = {
    join_code: code,
    race_id: race.race_id,
    horse_id: joinResp.horse_id,
    heartbeat_token: joinResp.heartbeat_token,
    horse_name: ownHorse?.name ?? stableHorseId,
    primary_model: joinResp.primary_model,
    counts_input: race.counts_input,
    primary_top5: race.primary_top5,
    score: raceTracker.toState(),
    last_heartbeat_at: new Date(0).toISOString(),
  };

  current = active;
  currentRaceName = race.name;
  await saveActiveRace(active);
  setStatus(deriveStatus(race, active.horse_id, race.name, false));

  beginLoop(api, active, raceTracker, race.status === 'pending');

  return { started: true };
}

export async function stopRace(): Promise<{ ok: true }> {
  stopLoop();
  current = null;
  currentRaceName = '';
  await clearActiveRace();
  setStatus(null);
  return { ok: true };
}

export async function getActiveRace(): Promise<ActiveRaceStatus | null> {
  return lastStatus;
}

// Called once on app launch (after identity load): if a race was mid-flight
// when the app last closed, rebuild the tracker from its persisted score and
// restart the loop rather than leaving the horse silently un-heartbeated.
export async function resumeIfActive(): Promise<void> {
  const saved = await loadActiveRace();
  if (!saved) return;

  applyEngineConfig(loadConfig());
  const api = buildApi();
  let race: GetRaceResponse | null;
  try {
    race = await api.getRace(saved.join_code);
  } catch (err) {
    // A genuinely dead race (deleted, or one the server no longer knows
    // about) means the persisted file is stale — clear it so we stop
    // retrying it forever. Anything else (network down, server 5xx) is
    // transient: leave the file in place so the next launch can retry.
    if (err instanceof ApiError && (err.code === 'RACE_NOT_FOUND' || err.code === 'RACE_FINISHED')) {
      await clearActiveRace();
    }
    return;
  }

  // The transport can resolve with `null` (a 200 with an empty/non-JSON
  // body) instead of throwing — e.g. a race that no longer exists. Treat
  // that the same as a dead race rather than crashing on `race.status`.
  if (!race) {
    await clearActiveRace();
    return;
  }

  if (race.status === 'finished') {
    await clearActiveRace();
    return;
  }

  const raceTracker = new RaceScoreTracker(saved.score, saved.primary_model, saved.primary_top5 ?? false);
  current = saved;
  currentRaceName = race.name;
  setStatus(deriveStatus(race, saved.horse_id, race.name, false));

  beginLoop(api, saved, raceTracker, race.status === 'pending');
}
