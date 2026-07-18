// Single source of truth for the main <-> renderer IPC contract. Both
// preload.ts and main.ts import from here so channel names and the result
// shape never drift apart.

import type {
  GetRaceResponse,
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
  WebSessionCreateResponse,
} from '@token-derby/shared';
import type { Config } from './config.js';

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
  getRace: 'api:getRace',
  listOrganisations: 'api:listOrganisations',
  getOrgLeaderboard: 'api:getOrgLeaderboard',
  joinOrganisation: 'api:joinOrganisation',
  createWebSession: 'api:createWebSession',
  getConfig: 'api:getConfig',
  setConfig: 'api:setConfig',
  signOut: 'api:signOut',
  openExternal: 'api:openExternal',
  checkForUpdate: 'api:checkForUpdate',
} as const;

export type ApiMethod = keyof typeof CHANNELS;
export type Channel = (typeof CHANNELS)[ApiMethod];

// Local-only snapshot the renderer uses to decide onboarding vs main UI —
// no network call, just current config + whatever identity is on disk.
export type Bootstrap = {
  identity: { user_id: string; display_name: string } | null;
  config: Config;
  appVersion: string;
};

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
  getRace(joinCode: string): Promise<Result<GetRaceResponse>>;
  listOrganisations(): Promise<Result<ListOrganisationsResponse>>;
  getOrgLeaderboard(orgId: string): Promise<Result<GetOrgLeaderboardResponse>>;
  joinOrganisation(token: string): Promise<Result<JoinOrganisationResponse>>;
  createWebSession(): Promise<Result<WebSessionCreateResponse>>;
  getConfig(): Promise<Result<Config>>;
  setConfig(patch: Partial<Config>): Promise<Result<Config>>;
  signOut(): Promise<Result<{ ok: true }>>;
  openExternal(url: string): Promise<Result<{ ok: true }>>;
  checkForUpdate(): Promise<Result<{ updateAvailable: boolean }>>;
};
