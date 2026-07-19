import { app, dialog, shell, type BrowserWindow } from 'electron';
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
import { checkForUpdate as runUpdateCheck, type UpdateCheckResult } from '../updater.js';

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

async function getOrgLeaderboard(orgName: string) {
  return guard(() => getApi().getOrgLeaderboard(orgName));
}

async function joinOrganisation(token: string) {
  return guard(() => getApi().joinOrganisation({ join_token: token }));
}

// Mirrors cli/src/commands/web.ts's `webOrigin()` — the site is served from
// the same origin as the API, minus the `/api` suffix.
function webOrigin(): string {
  return resolveApiBase(loadConfig()).replace(/\/api\/?$/, '');
}

async function createWebSession(): Promise<Result<{ url: string }>> {
  return guard(async () => {
    const { code } = await getApi().createWebSession();
    return { url: `${webOrigin()}/org-manager#code=${code}` };
  });
}

async function getConfig(): Promise<Result<Config>> {
  return guard(async () => loadConfig());
}

// env/apiBaseOverride changes need no extra wiring here: getTransport() and
// its getIdentity callback both call loadConfig() fresh on every request, so
// the very next api call already resolves against the new environment.
// launchAtLogin is the one setting with an OS-level side effect, so it's
// applied here rather than left as inert config-file state.
async function setConfig(patch: Partial<Config>): Promise<Result<Config>> {
  return guard(async () => {
    const next = saveConfig(patch);
    if (patch.launchAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    return next;
  });
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

// Lets the Settings "Home folder" override use a native picker instead of a
// bare text field. Cancelling the dialog resolves to a null path rather than
// an error — the caller just leaves the existing value in place.
async function chooseFolder(): Promise<Result<{ path: string | null }>> {
  return guard(async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  });
}

// Surfaces the "<user_id>:<secret_token>" pair Settings' "Copy identity"
// button hands to the clipboard — the same format Onboarding's paste-fallback
// step (and the CLI's identity.json) already use, so it round-trips there.
async function exportIdentity(): Promise<Result<{ token: string }>> {
  return guard(async () => {
    const identity = await identityStore.load(loadConfig());
    if (!identity) throw new Error('No identity to export');
    return { token: `${identity.user_id}:${identity.secret_token}` };
  });
}

async function quitApp(): Promise<Result<{ ok: true }>> {
  return guard(async () => {
    app.quit();
    return { ok: true as const };
  });
}

async function checkForUpdate(): Promise<Result<UpdateCheckResult>> {
  return guard(() => runUpdateCheck(getClientVersion()));
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
  chooseFolder,
  exportIdentity,
  quitApp,
} satisfies DesktopApi;
