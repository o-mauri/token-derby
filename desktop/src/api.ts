import type { DesktopApi } from '../electron/ipc.js';

// preload.ts exposes this via contextBridge; this file is just the renderer's
// typed handle onto it, so the rest of src/ never touches the global directly.
declare global {
  interface Window {
    api: DesktopApi;
  }
}

export const api: DesktopApi = window.api;
