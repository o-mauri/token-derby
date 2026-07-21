import { describe, it, expect, vi } from 'vitest';
import type { ActiveRaceStatus } from '../electron/ipc.js';
import { trayTitle, trayMenuTemplate, type TrayMenuActions } from '../electron/tray-status.js';

function status(overrides: Partial<ActiveRaceStatus> = {}): ActiveRaceStatus {
  return {
    joinCode: 'ABC123',
    raceName: 'Test Race',
    horseId: 'horse-1',
    rank: 2,
    tokens: 1_234_567,
    status: 'live',
    stalled: false,
    ...overrides,
  };
}

function actions(): TrayMenuActions {
  return {
    onOpenPopover: vi.fn(),
    onOpenRaceTrack: vi.fn(),
    onStopRace: vi.fn(),
    onQuit: vi.fn(),
  };
}

describe('trayTitle', () => {
  it('is empty when idle (no active race)', () => {
    expect(trayTitle(null)).toBe('');
  });

  it('renders rank + formatted tokens while racing, with a leading space', () => {
    expect(trayTitle(status({ rank: 2, tokens: 1_234_567 }))).toBe(' P2 · 1.23M');
  });

  it('omits the rank prefix when rank is null', () => {
    expect(trayTitle(status({ rank: null, tokens: 950 }))).toBe(' · 950');
  });

  it('is empty once the race has finished', () => {
    expect(trayTitle(status({ status: 'finished' }))).toBe('');
  });

  it('renders for a pending race', () => {
    expect(trayTitle(status({ status: 'pending', rank: null, tokens: 0 }))).toBe(' · 0');
  });
});

describe('trayMenuTemplate', () => {
  it('builds the idle menu (Open Token Derby / separator / Quit) when there is no active race', () => {
    const a = actions();
    const items = trayMenuTemplate(null, a);
    expect(items.map(i => i.label ?? i.type)).toEqual(['Open Token Derby', 'separator', 'Quit']);

    items[0]!.click?.();
    expect(a.onOpenPopover).toHaveBeenCalled();

    items[2]!.click?.();
    expect(a.onQuit).toHaveBeenCalled();
  });

  it('builds the idle menu when the race has finished', () => {
    const items = trayMenuTemplate(status({ status: 'finished' }), actions());
    expect(items.map(i => i.label ?? i.type)).toEqual(['Open Token Derby', 'separator', 'Quit']);
  });

  it('builds the racing menu with race name, Open race track, Stop racing, separator, Quit', () => {
    const a = actions();
    const s = status({ raceName: 'Derby 42', joinCode: 'ZZZ999' });
    const items = trayMenuTemplate(s, a);
    expect(items.map(i => i.label ?? i.type)).toEqual([
      'Derby 42',
      'Open race track',
      'Stop racing',
      'separator',
      'Quit',
    ]);
    expect(items[0]!.enabled).toBe(false);

    items[1]!.click?.();
    expect(a.onOpenRaceTrack).toHaveBeenCalledWith('ZZZ999');

    items[2]!.click?.();
    expect(a.onStopRace).toHaveBeenCalled();
  });

  it('treats a pending race as racing (not idle)', () => {
    const items = trayMenuTemplate(status({ status: 'pending' }), actions());
    expect(items.map(i => i.label ?? i.type)).toEqual([
      'Test Race',
      'Open race track',
      'Stop racing',
      'separator',
      'Quit',
    ]);
  });
});
