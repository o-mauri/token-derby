import { app, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';

// Displayed menu-bar glyph height in points. Tune this one number to resize.
const TRAY_ICON_HEIGHT = 16;

// Builds the menu-bar tray icon. `onToggle` is provided by main.ts and owns
// showing/hiding + positioning the popover under this tray's bounds.
export function createTray(onToggle: () => void): Tray {
  const iconPath = path.join(__dirname, 'assets/trayTemplate.png');
  // Pin the glyph height so it sits at a normal menu-bar size regardless of the
  // source PNG's dimensions; resizing by height preserves aspect ratio.
  const icon = nativeImage.createFromPath(iconPath).resize({ height: TRAY_ICON_HEIGHT });
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
