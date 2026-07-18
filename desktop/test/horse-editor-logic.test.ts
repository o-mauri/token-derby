import { describe, it, expect } from 'vitest';
import type { StableHorse } from '@token-derby/shared';
import { mergeRollRefresh, type StableHorseEditorState } from '../src/windows/horse-editor-logic.js';

function makeHorse(overrides: Partial<StableHorse> = {}): StableHorse {
  return {
    stable_horse_id: 'h1',
    name: 'Server Name',
    colors: { body: '#111111', mane: '#222222', tail: '#333333', saddle: '#444444' },
    created_at: '2026-01-01T00:00:00.000Z',
    xp: 10,
    hats: [],
    equipped_hat: null,
    ...overrides,
  };
}

describe('mergeRollRefresh', () => {
  it('preserves the user\'s unsaved name and colour edits', () => {
    const prev: StableHorseEditorState = {
      name: 'Custom Unsaved Name',
      colors: { body: '#aaaaaa', mane: '#bbbbbb', tail: '#cccccc', saddle: '#dddddd' },
      horse: makeHorse({ xp: 5, hats: [] }),
      hatChoice: null,
    };
    const fresh = makeHorse({ xp: 15, hats: [{ id: 'flat_cap', variant: 0, obtained_at: '2026-01-02T00:00:00.000Z' }] });

    const merged = mergeRollRefresh(prev, fresh);

    expect(merged.name).toBe('Custom Unsaved Name');
    expect(merged.colors).toEqual({ body: '#aaaaaa', mane: '#bbbbbb', tail: '#cccccc', saddle: '#dddddd' });
  });

  it('refreshes hats, xp, and equipped state from the fresh horse', () => {
    const prev: StableHorseEditorState = {
      name: 'Anything',
      colors: { body: '#aaaaaa', mane: '#bbbbbb', tail: '#cccccc', saddle: '#dddddd' },
      horse: makeHorse({ xp: 5, hats: [] }),
      hatChoice: null,
    };
    const fresh = makeHorse({
      xp: 15,
      hats: [{ id: 'flat_cap', variant: 0, obtained_at: '2026-01-02T00:00:00.000Z' }],
      equipped_hat: 0,
    });

    const merged = mergeRollRefresh(prev, fresh);

    expect(merged.horse).toBe(fresh);
    expect(merged.horse.xp).toBe(15);
    expect(merged.horse.hats).toEqual(fresh.hats);
    expect(merged.hatChoice).toBe(0);
  });

  it('falls back to null hatChoice when the fresh horse has no equipped hat', () => {
    const prev: StableHorseEditorState = {
      name: 'Anything',
      colors: { body: '#aaaaaa', mane: '#bbbbbb', tail: '#cccccc', saddle: '#dddddd' },
      horse: makeHorse(),
      hatChoice: 2,
    };
    const fresh = makeHorse({ equipped_hat: undefined });

    const merged = mergeRollRefresh(prev, fresh);

    expect(merged.hatChoice).toBeNull();
  });
});
