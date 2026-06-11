/**
 * `equipped_hat` is an index into `hats[]`. After removing the hat at
 * `removedIndex`, return the adjusted equipped index (or null = unequipped).
 */
export function adjustEquippedAfterRemoval(
  equipped: number | null | undefined,
  removedIndex: number,
): number | null {
  if (equipped === null || equipped === undefined) return null;
  if (equipped === removedIndex) return null;
  if (equipped > removedIndex) return equipped - 1;
  return equipped;
}
