import { app, ipcMain, shell, Notification, nativeTheme, type BrowserWindow } from 'electron';
import { createPopover, createAppWindow, positionPopoverUnderTray } from './windows.js';
import { createTray } from './tray.js';
import { CHANNELS, type DesktopApi, type Result } from './ipc.js';
import { apiService } from './services/api.js';
import { loadConfig } from './config.js';
import * as identityStore from './identity.js';

// Menu-bar app: no dock icon, and the app stays resident when all windows close.
app.dock?.hide();

// Wire every window.api method to its main-process implementation. Each
// apiService method already returns a never-throwing Result, so handlers
// need no try/catch of their own.
const handlers = apiService as unknown as Record<keyof DesktopApi, (...args: unknown[]) => Promise<unknown>>;

// Once one of these succeeds during onboarding, an identity now exists —
// close the onboarding window and reveal the popover.
const IDENTITY_CHANNELS: Set<string> = new Set([
  CHANNELS.initJockey,
  CHANNELS.importCliIdentity,
  CHANNELS.pasteIdentity,
]);

app.whenReady().then(async () => {
  // The UI is a dark design (cream on dark). Force dark appearance so the
  // popover's vibrancy renders as dark glass rather than light frost when the
  // user's macOS is in light mode — otherwise cream text washes out.
  nativeTheme.themeSource = 'dark';

  const popover = createPopover();
  let onboardingWindow: BrowserWindow | null = null;

  const tray = createTray(() => {
    if (popover.isVisible()) {
      popover.hide();
      return;
    }
    positionPopoverUnderTray(popover, tray.getBounds());
    popover.show();
    popover.focus();
  });

  for (const method of Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]) {
    const channel = CHANNELS[method];
    ipcMain.handle(channel, async (_event, ...args) => {
      const result = (await handlers[method](...args)) as Result<unknown>;
      if (IDENTITY_CHANNELS.has(channel) && onboardingWindow && result.ok) {
        onboardingWindow.close();
        onboardingWindow = null;
        positionPopoverUnderTray(popover, tray.getBounds());
        popover.show();
        popover.focus();
      }
      // Mirror image of the above: Settings' sign-out clears the identity on
      // disk, so send the user back through onboarding instead of leaving
      // them looking at a now-invalid popover.
      if (channel === CHANNELS.signOut && result.ok) {
        popover.hide();
        if (!onboardingWindow || onboardingWindow.isDestroyed()) {
          onboardingWindow = createAppWindow('/onboarding');
        }
      }
      return result;
    });
  }

  const identity = await identityStore.load(loadConfig());
  if (!identity) {
    onboardingWindow = createAppWindow('/onboarding');
  }

  // Best-effort, non-blocking: a slow or unreachable feed should never delay
  // startup, and Settings' "Check for updates" button covers the on-demand
  // path regardless of how this turns out.
  checkForUpdateOnLaunch();
});

async function checkForUpdateOnLaunch(): Promise<void> {
  try {
    const result = await apiService.checkForUpdate();
    if (!result.ok || !result.data.update) return;
    const { version, url } = result.data;
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: 'Token Derby update available',
      body: `Version ${version} is ready to download.`,
    });
    notification.on('click', () => {
      shell.openExternal(url).catch(() => {
        // Non-fatal: the user can still open Settings and click through.
      });
    });
    notification.show();
  } catch {
    // Non-fatal — see comment above.
  }
}

app.on('window-all-closed', () => {
  // Menu-bar app: stay resident even with no windows open.
});
