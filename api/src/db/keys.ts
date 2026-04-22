export function raceMetaKey(race_id: string) {
  return { pk: `RACE#${race_id}`, sk: 'META' };
}

export function horseKey(race_id: string, horse_id: string) {
  return { pk: `RACE#${race_id}`, sk: `HORSE#${horse_id}` };
}

export function parseHorseId(sk: string): string | null {
  const prefix = 'HORSE#';
  return sk.startsWith(prefix) ? sk.slice(prefix.length) : null;
}
