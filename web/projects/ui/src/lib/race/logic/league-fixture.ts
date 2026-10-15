// Story data for the league tabs: the old preview's league, post-race.
import type { SeasonStandings } from '@token-derby/shared';
import type { HorseColors } from '../../horse/horse';
import { divisionResults, type DivisionRunner } from './league';

const COLORS: HorseColors[] = [
  { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
  { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
];
const FIELD: [string, string, number][] = [
  ['Comet', 'Alice', 4820], ['Oak', 'Eve', 4550], ['Bolt', 'Bob', 4310], ['Newbie', 'Frank', 3400],
  ['Dash', 'Carol', 3120], ['Fern', 'Grace', 2600], ['Ada', 'Dan', 1980], ['Gale', 'Heidi', 900],
  ['Juniper', 'Ivan', 2750], ['Maple', 'Judy', 2210], ['Pepper', 'Ken', 1720], ['Quill', 'Lin', 1400],
  ['Rocket', 'Mo', 3900], ['Saffron', 'Nia', 3010], ['Tango', 'Oli', 650], ['Umber', 'Pat', 480],
];
export const LEAGUE_NAMES = ['Premier', 'Championship', 'League One', 'League Two', 'National'];
const PREMIER = new Set(['Comet', 'Bolt', 'Dash', 'Ada']);

/** The field split into `divisions` divisions: the first two match the old preview, the rest are fillers. */
export function leagueRunners(divisions: number): DivisionRunner[] {
  const count = divisions <= 2 ? 8 : 16;
  return FIELD.slice(0, count).map(([name, owner, tokens], i) => ({
    id: name, stableId: `s-${name}`, name, owner, colors: COLORS[i % COLORS.length]!, hat: null, tokens, joinedAt: i,
    division: i < 8 ? (PREMIER.has(name) ? 1 : 2) : 3 + ((i - 8) % (divisions - 2)),
  }));
}

/** Post-race standings built from this race plus fixed earlier points, so movement marks show. */
export function leagueStandings(divisions: number, round: number, total = 8): SeasonStandings {
  const before: Record<string, [number, number]> = { Bolt: [24, 90000], Ada: [18, 72000], Comet: [10, 60000], Dash: [6, 40000], Oak: [15, 55000], Fern: [9, 41000], Gale: [4, 20000] };
  const results = divisionResults(leagueRunners(divisions), LEAGUE_NAMES);
  return {
    org_name: 'Anthropic', season: 2, round, races_per_season: total,
    divisions: results.map((d, di) => {
      const rows = d.rows.map((r, i) => {
        const [pts, tok] = before[r.name] ?? (r.name === 'Newbie' ? [0, 0] : [8 - i, 30000 - i * 1000]);
        return { stable_horse_id: r.stableId, horse_name: r.name, user_name: r.owner, points: pts + r.points, season_tokens: tok + r.tokens };
      }).sort((a, b) => b.points - a.points || b.season_tokens - a.season_tokens);
      return {
        division: d.division, name: d.name,
        rows: rows.map((r, i) => ({ ...r, rank: i + 1,
          zone: di > 0 && i === 0 ? 'promote' as const : di < results.length - 1 && i === rows.length - 1 ? 'relegate' as const : null })),
      };
    }),
  };
}
