import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNELS, RACING_STATUS_CHANNEL, type DesktopApi, type RacingStatusListener } from './ipc.js';

// Thin, one-to-one wrappers over ipcRenderer.invoke — all the actual work
// happens in the main-process api service (services/api.ts).
const api: DesktopApi = {
  getBootstrap: () => ipcRenderer.invoke(CHANNELS.getBootstrap),
  initJockey: (name) => ipcRenderer.invoke(CHANNELS.initJockey, name),
  importCliIdentity: () => ipcRenderer.invoke(CHANNELS.importCliIdentity),
  pasteIdentity: (token) => ipcRenderer.invoke(CHANNELS.pasteIdentity, token),
  getJockey: () => ipcRenderer.invoke(CHANNELS.getJockey),
  updateJockey: (name) => ipcRenderer.invoke(CHANNELS.updateJockey, name),
  listStable: () => ipcRenderer.invoke(CHANNELS.listStable),
  createStableHorse: (req) => ipcRenderer.invoke(CHANNELS.createStableHorse, req),
  updateStableHorse: (id, req) => ipcRenderer.invoke(CHANNELS.updateStableHorse, id, req),
  deleteStableHorse: (id) => ipcRenderer.invoke(CHANNELS.deleteStableHorse, id),
  rollHat: (id) => ipcRenderer.invoke(CHANNELS.rollHat, id),
  equipHat: (id, req) => ipcRenderer.invoke(CHANNELS.equipHat, id, req),
  openHorseEditor: (id) => ipcRenderer.invoke(CHANNELS.openHorseEditor, id),
  openRaceTrack: (joinCode) => ipcRenderer.invoke(CHANNELS.openRaceTrack, joinCode),
  getRace: (joinCode) => ipcRenderer.invoke(CHANNELS.getRace, joinCode),
  listOrganisations: () => ipcRenderer.invoke(CHANNELS.listOrganisations),
  getOrgLeaderboard: (orgName) => ipcRenderer.invoke(CHANNELS.getOrgLeaderboard, orgName),
  joinOrganisation: (token) => ipcRenderer.invoke(CHANNELS.joinOrganisation, token),
  createWebSession: () => ipcRenderer.invoke(CHANNELS.createWebSession),
  getConfig: () => ipcRenderer.invoke(CHANNELS.getConfig),
  setConfig: (patch) => ipcRenderer.invoke(CHANNELS.setConfig, patch),
  signOut: () => ipcRenderer.invoke(CHANNELS.signOut),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  checkForUpdate: () => ipcRenderer.invoke(CHANNELS.checkForUpdate),
  chooseFolder: () => ipcRenderer.invoke(CHANNELS.chooseFolder),
  exportIdentity: () => ipcRenderer.invoke(CHANNELS.exportIdentity),
  quitApp: () => ipcRenderer.invoke(CHANNELS.quitApp),
  startRace: (joinCode, stableHorseId, primaryModel, opts) =>
    ipcRenderer.invoke(CHANNELS.startRace, joinCode, stableHorseId, primaryModel, opts),
  stopRace: () => ipcRenderer.invoke(CHANNELS.stopRace),
  getActiveRace: () => ipcRenderer.invoke(CHANNELS.getActiveRace),
};

contextBridge.exposeInMainWorld('api', api);

// Pushed racing status updates (heartbeat ack/stall/finish/stop) — a
// subscription rather than an invoke/Result round trip, so it's its own
// small bridge instead of a DesktopApi method. Returns an unsubscribe fn.
contextBridge.exposeInMainWorld('racingStatus', {
  subscribe(cb: RacingStatusListener): () => void {
    const listener = (_event: IpcRendererEvent, status: Parameters<RacingStatusListener>[0]) => cb(status);
    ipcRenderer.on(RACING_STATUS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(RACING_STATUS_CHANNEL, listener);
  },
});
