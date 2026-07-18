import type { HorseColors, StableHorse } from '@token-derby/shared';

export type StableHorseEditorState = {
  name: string;
  colors: HorseColors;
  horse: StableHorse;
  hatChoice: number | null;
};

// After a roll, the freshly-fetched stable horse is authoritative for hats,
// XP, and equipped state — but never for the user's in-progress name/colour
// edits, which must survive a roll untouched until they explicitly hit Save.
// Only `horse` and `hatChoice` are refreshed from `fresh`; `name`/`colors`
// pass through unchanged from `prev`.
export function mergeRollRefresh(
  prev: StableHorseEditorState,
  fresh: StableHorse,
): StableHorseEditorState {
  return {
    name: prev.name,
    colors: prev.colors,
    horse: fresh,
    hatChoice: fresh.equipped_hat ?? null,
  };
}
