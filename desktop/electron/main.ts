import { app, ipcMain } from 'electron';
import { createPopover, positionPopoverUnderTray } from './windows.js';
import { createTray } from './tray.js';
import { CHANNELS, type DesktopApi } from './ipc.js';
import { apiService } from './services/api.js';

// Menu-bar app: no dock icon, and the app stays resident when all windows close.
app.dock?.hide();

// Wire every window.api method to its main-process implementation. Each
// apiService method already returns a never-throwing Result, so handlers
// need no try/catch of their own.
const handlers = apiService as unknown as Record<keyof DesktopApi, (...args: unknown[]) => Promise<unknown>>;
for (const method of Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]) {
  ipcMain.handle(CHANNELS[method], (_event, ...args) => handlers[method](...args));
}

app.whenReady().then(() => {
  const popover = createPopover();

  const tray = createTray(() => {
    if (popover.isVisible()) {
      popover.hide();
      return;
    }
    positionPopoverUnderTray(popover, tray.getBounds());
    popover.show();
    popover.focus();
  });
});

app.on('window-all-closed', () => {
  // Menu-bar app: stay resident even with no windows open.
});
