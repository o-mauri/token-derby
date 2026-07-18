import { app } from 'electron';
import { createPopover, positionPopoverUnderTray } from './windows.js';
import { createTray } from './tray.js';

// Menu-bar app: no dock icon, and the app stays resident when all windows close.
app.dock?.hide();

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
