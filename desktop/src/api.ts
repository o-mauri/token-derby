import type { DesktopApi, Bootstrap, Result } from '../electron/ipc.js';
import type { Config } from '../electron/config.js';
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

// preload.ts exposes this via contextBridge; this file is the renderer's
// typed handle onto it. Every method here unwraps window.api's Result<T> —
// screens call e.g. `api.getRace(code)` and get T back directly, or catch a
// DesktopApiError carrying the code so they can map it via errorMessage(code).
declare global {
  interface Window {
    api: DesktopApi;
  }
}

export class DesktopApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DesktopApiError';
  }
}

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  throw new DesktopApiError(result.code, result.message);
}

export const api = {
  getBootstrap: (): Promise<Bootstrap> => window.api.getBootstrap().then(unwrap),
  initJockey: (name: string): Promise<{ user_id: string; display_name: string }> =>
    window.api.initJockey(name).then(unwrap),
  importCliIdentity: (): Promise<{ user_id: string; display_name: string }> =>
    window.api.importCliIdentity().then(unwrap),
  pasteIdentity: (token: string): Promise<{ user_id: string; display_name: string }> =>
    window.api.pasteIdentity(token).then(unwrap),
  getJockey: (): Promise<GetJockeyResponse> => window.api.getJockey().then(unwrap),
  updateJockey: (name: string): Promise<UpdateJockeyResponse> => window.api.updateJockey(name).then(unwrap),
  listStable: (): Promise<ListStableResponse> => window.api.listStable().then(unwrap),
  createStableHorse: (req: CreateStableHorseRequest): Promise<CreateStableHorseResponse> =>
    window.api.createStableHorse(req).then(unwrap),
  updateStableHorse: (id: string, req: UpdateStableHorseRequest): Promise<UpdateStableHorseResponse> =>
    window.api.updateStableHorse(id, req).then(unwrap),
  deleteStableHorse: (id: string): Promise<DeleteStableHorseResponse> =>
    window.api.deleteStableHorse(id).then(unwrap),
  rollHat: (id: string): Promise<RollHatResponse> => window.api.rollHat(id).then(unwrap),
  equipHat: (id: string, req: EquipHatRequest): Promise<EquipHatResponse> =>
    window.api.equipHat(id, req).then(unwrap),
  getRace: (joinCode: string): Promise<GetRaceResponse> => window.api.getRace(joinCode).then(unwrap),
  listOrganisations: (): Promise<ListOrganisationsResponse> => window.api.listOrganisations().then(unwrap),
  getOrgLeaderboard: (orgId: string): Promise<GetOrgLeaderboardResponse> =>
    window.api.getOrgLeaderboard(orgId).then(unwrap),
  joinOrganisation: (token: string): Promise<JoinOrganisationResponse> =>
    window.api.joinOrganisation(token).then(unwrap),
  createWebSession: (): Promise<WebSessionCreateResponse> => window.api.createWebSession().then(unwrap),
  getConfig: (): Promise<Config> => window.api.getConfig().then(unwrap),
  setConfig: (patch: Partial<Config>): Promise<Config> => window.api.setConfig(patch).then(unwrap),
  signOut: (): Promise<{ ok: true }> => window.api.signOut().then(unwrap),
  openExternal: (url: string): Promise<{ ok: true }> => window.api.openExternal(url).then(unwrap),
  checkForUpdate: (): Promise<{ updateAvailable: boolean }> => window.api.checkForUpdate().then(unwrap),
};
