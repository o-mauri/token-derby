import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';

// Builds the menu-bar tray icon. `onToggle` is provided by main.ts and owns
// showing/hiding + positioning the popover under this tray's bounds.
export function createTray(onToggle: () => void): Tray {
  const iconPath = path.join(__dirname, 'assets/trayTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  const tray = new Tray(icon);
  tray.setToolTip('Token Derby');
  tray.on('click', onToggle);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Token Derby', click: onToggle },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));

  return tray;
}
