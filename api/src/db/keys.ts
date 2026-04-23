export const RACE_PK_PREFIX = 'RACE#';
export const HORSE_SK_PREFIX = 'HORSE#';

export function raceMetaKey(race_id: string) {
  return { pk: `${RACE_PK_PREFIX}${race_id}`, sk: 'META' };
}

export function horseKey(race_id: string, horse_id: string) {
  return { pk: `${RACE_PK_PREFIX}${race_id}`, sk: `${HORSE_SK_PREFIX}${horse_id}` };
}

export function parseHorseId(sk: string): string | null {
  return sk.startsWith(HORSE_SK_PREFIX) ? sk.slice(HORSE_SK_PREFIX.length) : null;
}
