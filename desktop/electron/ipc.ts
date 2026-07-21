// Single source of truth for the main <-> renderer IPC contract. Both
// preload.ts and main.ts import from here so channel names and the result
// shape never drift apart.

import type {
  GetRaceResponse,
  GetRaceSeriesResponse,
  ListOrganisationsResponse,
  GetOrgLeaderboardResponse,
  JoinOrganisationResponse,
  GetJockeyResponse,
  UpdateJockeyResponse,
  ListStableResponse,
  CreateStableHorseRequest,
  CreateStableHorseResponse,
  UpdateStableHorseRequest,
  UpdateStableHorseResponse,
  DeleteStableHorseResponse,
  RollHatResponse,
  EquipHatRequest,
  EquipHatResponse,
  ModelKey,
  RaceStatus,
} from '@token-derby/shared';
import type { Config } from './config.js';
import type { UpdateCheckResult } from './updater.js';

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

// One entry per `window.api` method. The key is also the api-service method
// name, so main.ts can wire `ipcMain.handle` generically off this map.
export const CHANNELS = {
  getBootstrap: 'api:getBootstrap',
  initJockey: 'api:initJockey',
  importCliIdentity: 'api:importCliIdentity',
  pasteIdentity: 'api:pasteIdentity',
  getJockey: 'api:getJockey',
  updateJockey: 'api:updateJockey',
  listStable: 'api:listStable',
  createStableHorse: 'api:createStableHorse',
  updateStableHorse: 'api:updateStableHorse',
  deleteStableHorse: 'api:deleteStableHorse',
  rollHat: 'api:rollHat',
  equipHat: 'api:equipHat',
  openHorseEditor: 'api:openHorseEditor',
  openRaceTrack: 'api:openRaceTrack',
  getRace: 'api:getRace',
  getRaceSeries: 'api:getRaceSeries',
  listOrganisations: 'api:listOrganisations',
  getOrgLeaderboard: 'api:getOrgLeaderboard',
  joinOrganisation: 'api:joinOrganisation',
  createWebSession: 'api:createWebSession',
  getConfig: 'api:getConfig',
  setConfig: 'api:setConfig',
  signOut: 'api:signOut',
  openExternal: 'api:openExternal',
  checkForUpdate: 'api:checkForUpdate',
  chooseFolder: 'api:chooseFolder',
  exportIdentity: 'api:exportIdentity',
  quitApp: 'api:quitApp',
  startRace: 'api:startRace',
  stopRace: 'api:stopRace',
  getActiveRace: 'api:getActiveRace',
} as const;

export type ApiMethod = keyof typeof CHANNELS;
export type Channel = (typeof CHANNELS)[ApiMethod];

// Main → renderer push whenever the racing engine's status changes (new
// heartbeat ack, stall, finish, or the race being stopped). Not part of the
// invoke-style CHANNELS map above since it's a one-way event, not a request.
export const RACING_STATUS_CHANNEL = 'racing:status';

// Snapshot the racing engine emits on every status change and returns from
// getActiveRace(). `rank`/`tokens` come from the horse's entry in the race's
// server-side horse list; `stalled` comes from the score tracker.
export type ActiveRaceStatus = {
  joinCode: string;
  raceName: string;
  horseId: string;
  rank: number | null;
  tokens: number;
  status: RaceStatus;
  stalled: boolean;
};

// Renderer-side subscribe callback for RACING_STATUS_CHANNEL pushes. Kept
// separate from CHANNELS/DesktopApi — those are all invoke/Result round
// trips, and this is a subscription — so preload.ts exposes it as its own
// small bridge rather than folding it into the generic per-method wiring.
export type RacingStatusListener = (status: ActiveRaceStatus | null) => void;

// Local-only snapshot the renderer uses to decide onboarding vs main UI —
// no network call, just current config + whatever identity is on disk.
export type Bootstrap = {
  identity: { user_id: string; display_name: string } | null;
  config: Config;
  appVersion: string;
};

// The server's WebSessionCreateResponse is just `{ code }` — main resolves
// that one-time code against the current env's web origin (same
// origin-stripping the CLI's `token-derby web` uses) so the renderer gets a
// URL it can hand straight to openExternal.
export type WebSessionHandoff = { url: string };

// The full `window.api` surface. preload.ts implements this by wrapping each
// method in `ipcRenderer.invoke`; services/api.ts implements the main-process
// side, and `apiService satisfies DesktopApi` keeps the two from drifting.
export type DesktopApi = {
  getBootstrap(): Promise<Result<Bootstrap>>;
  initJockey(name: string): Promise<Result<{ user_id: string; display_name: string }>>;
  importCliIdentity(): Promise<Result<{ user_id: string; display_name: string }>>;
  pasteIdentity(token: string): Promise<Result<{ user_id: string; display_name: string }>>;
  getJockey(): Promise<Result<GetJockeyResponse>>;
  updateJockey(name: string): Promise<Result<UpdateJockeyResponse>>;
  listStable(): Promise<Result<ListStableResponse>>;
  createStableHorse(req: CreateStableHorseRequest): Promise<Result<CreateStableHorseResponse>>;
  updateStableHorse(id: string, req: UpdateStableHorseRequest): Promise<Result<UpdateStableHorseResponse>>;
  deleteStableHorse(id: string): Promise<Result<DeleteStableHorseResponse>>;
  rollHat(id: string): Promise<Result<RollHatResponse>>;
  equipHat(id: string, req: EquipHatRequest): Promise<Result<EquipHatResponse>>;
  // Opens (or focuses an already-open) horse editor BrowserWindow for this
  // stable horse. Lives in the api service so main.ts's generic CHANNELS
  // wiring picks it up for free, same as every other window.api method.
  openHorseEditor(stableHorseId: string): Promise<Result<{ ok: true }>>;
  // Opens (or focuses) the race-track BrowserWindow for this join code —
  // same one-window-per-key pattern as openHorseEditor. The window itself
  // renders `/race-track/:joinCode` (a placeholder until Task D1 ports the
  // full view).
  openRaceTrack(joinCode: string): Promise<Result<{ ok: true }>>;
  getRace(joinCode: string): Promise<Result<GetRaceResponse>>;
  // Time-series token deltas per horse, feeding the race-track window's
  // token-over-time chart faces (mirrors the site's fetchRaceSeries).
  getRaceSeries(joinCode: string): Promise<Result<GetRaceSeriesResponse>>;
  listOrganisations(): Promise<Result<ListOrganisationsResponse>>;
  getOrgLeaderboard(orgName: string): Promise<Result<GetOrgLeaderboardResponse>>;
  joinOrganisation(token: string): Promise<Result<JoinOrganisationResponse>>;
  createWebSession(): Promise<Result<WebSessionHandoff>>;
  getConfig(): Promise<Result<Config>>;
  setConfig(patch: Partial<Config>): Promise<Result<Config>>;
  signOut(): Promise<Result<{ ok: true }>>;
  openExternal(url: string): Promise<Result<{ ok: true }>>;
  checkForUpdate(): Promise<Result<UpdateCheckResult>>;
  // Native folder picker backing Settings' Advanced "Home folder" override.
  chooseFolder(): Promise<Result<{ path: string | null }>>;
  // "<user_id>:<secret_token>" pair for Settings' "Copy identity" action.
  exportIdentity(): Promise<Result<{ token: string }>>;
  quitApp(): Promise<Result<{ ok: true }>>;
  // Soft guard: unless opts.confirm, a horse heartbeating within the last two
  // intervals returns { started: false, needsConfirm: true } instead of joining.
  startRace(
    joinCode: string,
    stableHorseId: string,
    primaryModel: ModelKey,
    opts?: { confirm?: boolean },
  ): Promise<Result<{ started: boolean; needsConfirm?: boolean }>>;
  stopRace(): Promise<Result<{ ok: true }>>;
  getActiveRace(): Promise<Result<ActiveRaceStatus | null>>;
};
