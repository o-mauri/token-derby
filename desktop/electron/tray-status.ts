// Pure tray-rendering logic — title text and context-menu template — kept
// free of any live `electron` import so it's unit-testable without mocking
// the module. tray.ts is the only caller that turns the template into a
// real Menu and wires it up to a Tray instance.
import { formatTokens } from '@token-derby/shared';
import type { ActiveRaceStatus } from './ipc.js';

// A `finished` status is a terminal, one-shot push from the engine (it never
// resets to null on its own) — treat it the same as "no active race" so the
// tray reverts once the race is over rather than sticking on the last beat.
function isRacing(status: ActiveRaceStatus | null): status is ActiveRaceStatus {
  return status !== null && status.status !== 'finished';
}

// Text shown beside the tray glyph: ' P{rank} · {tokens}' while racing
// (leading space so it doesn't crowd the icon), '' when idle.
export function trayTitle(status: ActiveRaceStatus | null): string {
  if (!isRacing(status)) return '';
  const rank = status.rank !== null ? `P${status.rank} ` : '';
  return ` ${rank}· ${formatTokens(status.tokens)}`;
}

export type TrayMenuActions = {
  onOpenPopover: () => void;
  onOpenRaceTrack: (joinCode: string) => void;
  onStopRace: () => void;
  onQuit: () => void;
};

// Minimal shape of Electron's MenuItemConstructorOptions this module needs —
// avoids a live `electron` import just for a type.
export type TrayMenuItem = {
  label?: string;
  type?: 'separator';
  enabled?: boolean;
  click?: () => void;
};

// Racing: race name (disabled) / Open race track / Stop racing / separator /
// Quit. Idle (no active race, or the race just finished): Open Token Derby /
// separator / Quit.
export function trayMenuTemplate(status: ActiveRaceStatus | null, actions: TrayMenuActions): TrayMenuItem[] {
  if (isRacing(status)) {
    return [
      { label: status.raceName, enabled: false },
      { label: 'Open race track', click: () => actions.onOpenRaceTrack(status.joinCode) },
      { label: 'Stop racing', click: actions.onStopRace },
      { type: 'separator' },
      { label: 'Quit', click: actions.onQuit },
    ];
  }
  return [
    { label: 'Open Token Derby', click: actions.onOpenPopover },
    { type: 'separator' },
    { label: 'Quit', click: actions.onQuit },
  ];
}
