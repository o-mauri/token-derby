import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { trayTitle, trayMenuTemplate, type TrayMenuActions } from './tray-status.js';
import type { ActiveRaceStatus } from './ipc.js';

// Displayed menu-bar glyph height in points. Tune this one number to resize.
const TRAY_ICON_HEIGHT = 16;

// main.ts wires these to opening the race-track window and stopping the
// racing engine's loop — kept as injected callbacks (rather than importing
// racing/engine.ts here) so this module stays a leaf with no engine
// dependency.
export type TrayRacingActions = {
  onOpenRaceTrack: (joinCode: string) => void;
  onStopRace: () => void;
};

export type TrayHandle = {
  tray: Tray;
  // Call on every racing status change: updates the title text and rebuilds
  // the right-click menu (racing quick-menu vs. idle Open/Quit).
  setStatus: (status: ActiveRaceStatus | null) => void;
};

// Builds the menu-bar tray icon. `onToggle` is provided by main.ts and owns
// showing/hiding + positioning the popover under this tray's bounds.
export function createTray(onToggle: () => void, racingActions: TrayRacingActions): TrayHandle {
  const iconPath = path.join(__dirname, 'assets/trayTemplate.png');
  // Pin the glyph height so it sits at a normal menu-bar size regardless of the
  // source PNG's dimensions; resizing by height preserves aspect ratio.
  const icon = nativeImage.createFromPath(iconPath).resize({ height: TRAY_ICON_HEIGHT });
  icon.setTemplateImage(true);

  const tray = new Tray(icon);
  tray.setToolTip('Token Derby');
  tray.on('click', onToggle);

  const menuActions: TrayMenuActions = {
    onOpenPopover: onToggle,
    onOpenRaceTrack: racingActions.onOpenRaceTrack,
    onStopRace: racingActions.onStopRace,
    onQuit: () => app.quit(),
  };

  // The right-click handler always rebuilds the menu from the latest status
  // rather than a menu captured once at startup, so it stays in sync with
  // whatever setStatus last recorded.
  let latestStatus: ActiveRaceStatus | null = null;
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate(trayMenuTemplate(latestStatus, menuActions)));
  });

  function setStatus(status: ActiveRaceStatus | null): void {
    latestStatus = status;
    tray.setTitle(trayTitle(status));
  }

  return { tray, setStatus };
}
