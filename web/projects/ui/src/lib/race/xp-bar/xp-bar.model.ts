import { levelInfo } from '@token-derby/shared';

export type XpBarModel = {
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelledUp: boolean;
  readonly awarded: number;
  // Bar fill before and after the race, as a percentage of the level each sits in.
  readonly oldPct: number;
  readonly newPct: number;
  readonly into: number;
  readonly forLevel: number | null;
  readonly maxed: boolean;
};

/** What the XP bar shows for a horse that had `before` XP and was awarded `awarded` this race. */
export function xpBarModel(before: number, awarded: number): XpBarModel {
  const from = levelInfo(before);
  const to = levelInfo(before + Math.max(0, awarded));
  return {
    levelBefore: from.level,
    levelAfter: to.level,
    levelledUp: to.level > from.level,
    awarded: Math.max(0, awarded),
    oldPct: from.progress * 100,
    newPct: to.progress * 100,
    into: to.xp_into_level,
    forLevel: to.xp_for_level,
    maxed: to.next_level_xp === null,
  };
}
