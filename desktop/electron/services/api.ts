import { app, shell, type BrowserWindow } from 'electron';
import { createTransport, createEndpoints, ApiError } from '@token-derby/client';
import type {
  CreateStableHorseRequest,
  UpdateStableHorseRequest,
  EquipHatRequest,
} from '@token-derby/shared';
import type { DesktopApi, Bootstrap, Result } from '../ipc.js';
import { loadConfig, saveConfig, resolveApiBase, type Config } from '../config.js';
import * as identityStore from '../identity.js';
import { createAppWindow } from '../windows.js';

// Resolved lazily (Electron's `app` isn't available until the app is ready,
// and doesn't exist at all under vitest) and cached for the process lifetime.
let cachedVersion: string | null = null;

export function getClientVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = app.getVersion();
  } catch {
    cachedVersion = '0.0.0-dev';
  }
  return cachedVersion;
}

// Never throws across the IPC boundary: wraps a call that may reject with an
// ApiError (or anything else) into a discriminated Result.
export async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, code: err.code, message: err.message };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, code: 'UNKNOWN', message };
  }
}

function getTransport(clientVersion: string = getClientVersion()) {
  return createTransport({
    baseUrl: () => resolveApiBase(loadConfig()),
    client: 'desktop',
    clientVersion,
    getIdentity: async () => {
      const id = await identityStore.load(loadConfig());
      return id ? { user_id: id.user_id, secret_token: id.secret_token } : null;
    },
  });
}

function getApi() {
  return createEndpoints(getTransport());
}

async function getBootstrap(): Promise<Result<Bootstrap>> {
  return guard(async () => {
    const cfg = loadConfig();
    const id = await identityStore.load(cfg);
    return {
      identity: id ? { user_id: id.user_id, display_name: id.display_name } : null,
      config: cfg,
      appVersion: getClientVersion(),
    };
  });
}

async function initJockey(name: string): Promise<Result<{ user_id: string; display_name: string }>> {
  return guard(async () => {
    const cfg = loadConfig();
    const resp = await getApi().initJockey({ display_name: name });
    await identityStore.store(cfg, {
      user_id: resp.user_id,
      display_name: resp.display_name,
      secret_token: resp.secret_token,
    });
    return { user_id: resp.user_id, display_name: resp.display_name };
  });
}

async function importCliIdentity(): Promise<Result<{ user_id: string; display_name: string }>> {
  return guard(async () => {
    const identity = await identityStore.importFromCli(loadConfig());
    return { user_id: identity.user_id, display_name: identity.display_name };
  });
}

async function pasteIdentity(token: string): Promise<Result<{ user_id: string; display_name: string }>> {
  return guard(async () => {
    const cfg = loadConfig();
    const identity = await identityStore.pasteToken(cfg, token, async ({ user_id, secret_token }) => {
      const transport = createTransport({
        baseUrl: () => resolveApiBase(cfg),
        client: 'desktop',
        clientVersion: getClientVersion(),
        getIdentity: async () => ({ user_id, secret_token }),
      });
      return createEndpoints(transport).getJockey();
    });
    return { user_id: identity.user_id, display_name: identity.display_name };
  });
}

async function getJockey() {
  return guard(() => getApi().getJockey());
}

async function updateJockey(name: string) {
  return guard(async () => {
    const cfg = loadConfig();
    const resp = await getApi().updateJockey({ display_name: name });
    const existing = await identityStore.load(cfg);
    if (existing) {
      await identityStore.store(cfg, { ...existing, display_name: resp.display_name });
    }
    return resp;
  });
}

async function listStable() {
  return guard(() => getApi().listStable());
}

async function createStableHorse(req: CreateStableHorseRequest) {
  return guard(() => getApi().createStableHorse(req));
}

async function updateStableHorse(id: string, req: UpdateStableHorseRequest) {
  return guard(() => getApi().updateStableHorse(id, req));
}

async function deleteStableHorse(id: string) {
  return guard(() => getApi().deleteStableHorse(id));
}

async function rollHat(id: string) {
  return guard(() => getApi().rollHat(id));
}

async function equipHat(id: string, req: EquipHatRequest) {
  return guard(() => getApi().equipHat(id, req));
}

// One editor BrowserWindow per stable horse — a second click on an
// already-open horse focuses it instead of stacking duplicate windows.
const editorWindows = new Map<string, BrowserWindow>();

async function openHorseEditor(stableHorseId: string): Promise<Result<{ ok: true }>> {
  return guard(async () => {
    const existing = editorWindows.get(stableHorseId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return { ok: true as const };
    }
    const win = createAppWindow(`/horse/${encodeURIComponent(stableHorseId)}`);
    editorWindows.set(stableHorseId, win);
    win.on('closed', () => editorWindows.delete(stableHorseId));
    return { ok: true as const };
  });
}

async function getRace(joinCode: string) {
  return guard(() => getApi().getRace(joinCode));
}

async function listOrganisations() {
  return guard(() => getApi().listOrganisations());
}

async function getOrgLeaderboard(orgId: string) {
  return guard(() => getApi().getOrgLeaderboard(orgId));
}

async function joinOrganisation(token: string) {
  return guard(() => getApi().joinOrganisation({ join_token: token }));
}

async function createWebSession() {
  return guard(() => getApi().createWebSession());
}

async function getConfig(): Promise<Result<Config>> {
  return guard(async () => loadConfig());
}

async function setConfig(patch: Partial<Config>): Promise<Result<Config>> {
  return guard(async () => saveConfig(patch));
}

async function signOut(): Promise<Result<{ ok: true }>> {
  return guard(async () => {
    await identityStore.signOut(loadConfig());
    return { ok: true as const };
  });
}

async function openExternal(url: string): Promise<Result<{ ok: true }>> {
  return guard(async () => {
    await shell.openExternal(url);
    return { ok: true as const };
  });
}

// Real update-checking lands with distribution (Task 12) — stubbed so the
// window.api surface is stable for the renderer to build against now.
async function checkForUpdate(): Promise<Result<{ updateAvailable: boolean }>> {
  return guard(async () => ({ updateAvailable: false }));
}

export const apiService = {
  getBootstrap,
  initJockey,
  importCliIdentity,
  pasteIdentity,
  getJockey,
  updateJockey,
  listStable,
  createStableHorse,
  updateStableHorse,
  deleteStableHorse,
  rollHat,
  equipHat,
  openHorseEditor,
  getRace,
  listOrganisations,
  getOrgLeaderboard,
  joinOrganisation,
  createWebSession,
  getConfig,
  setConfig,
  signOut,
  openExternal,
  checkForUpdate,
} satisfies DesktopApi;
