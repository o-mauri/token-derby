import { BrowserWindow, screen } from 'electron';
import type { Rectangle } from 'electron';
import path from 'node:path';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

export function createPopover(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360, height: 520, show: false, frame: false, resizable: false,
    fullscreenable: false, skipTaskbar: true, vibrancy: 'under-window',
    visualEffectState: 'active', transparent: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js') },
  });
  loadRoute(win, '/'); // popover shell
  win.on('blur', () => win.hide());
  return win;
}

export function createAppWindow(route: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 720, height: 560, show: false, backgroundColor: '#1a1020',
    titleBarStyle: 'hiddenInset',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js') },
  });
  loadRoute(win, route);
  win.once('ready-to-show', () => win.show());
  return win;
}

function loadRoute(win: BrowserWindow, route: string) {
  if (isDev) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${route}`);
  else win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: route });
}

// Centers the popover horizontally under the tray icon, just below the menu bar.
export function positionPopoverUnderTray(win: BrowserWindow, trayBounds: Rectangle): void {
  const { width } = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height);
  const minX = display.workArea.x;
  const maxX = display.workArea.x + display.workArea.width - width;
  win.setPosition(Math.min(Math.max(x, minX), maxX), y, false);
}
