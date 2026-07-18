import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type DesktopApi } from './ipc.js';

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
  getRace: (joinCode) => ipcRenderer.invoke(CHANNELS.getRace, joinCode),
  listOrganisations: () => ipcRenderer.invoke(CHANNELS.listOrganisations),
  getOrgLeaderboard: (orgId) => ipcRenderer.invoke(CHANNELS.getOrgLeaderboard, orgId),
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
};

contextBridge.exposeInMainWorld('api', api);
