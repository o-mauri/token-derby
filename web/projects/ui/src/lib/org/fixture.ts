// Sample org data for the org component tests and stories.
import type { HorseColors } from '../horse/horse';
import type { WornHat } from '../hat/hat-pixels';
import type { LeaguePanelView, LivePanelView, OrgRunner, RacesPanelView, ResultRow, StatsPanelView } from './models';

const C: Record<string, HorseColors> = {
  brown: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  white: { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  plum: { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  tan: { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  green: { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
};
const COWBOY: WornHat = { id: 'cowboy_hat' };
const PARTY: WornHat = { id: 'party_hat' };

export function runner(name: string, owner: string, colors: keyof typeof C, tokens: number, hat: WornHat | null = null): OrgRunner {
  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, owner, colors: C[colors]!, hat, tokens };
}

const AT = Date.now();
export const LIVE_VIEW: Extract<LivePanelView, { kind: 'live' }> = {
  kind: 'live', code: 'K7QX', name: 'Friday Sprint', runners: 12, elapsedPct: 27, anchor: { atMs: AT, timeLeftSeconds: 2 * 3600 + 14 * 60 + 9 },
  leader: { ...runner('Gallopz', 'dana', 'brown', 4_210_000, COWBOY), pace: 62_400 },
  chasers: [
    { ...runner('Neigh Sayer', 'omar', 'white', 3_380_000), place: 2, gap: 830_000 },
    { ...runner('Hay Girl', 'sam', 'plum', 2_710_000, PARTY), place: 3, gap: 1_500_000 },
    { ...runner('Seabiscuit', 'kit', 'tan', 1_640_000), place: 4, gap: 2_570_000 },
    { ...runner('Trotsky', 'lee', 'green', 990_000), place: 5, gap: 3_220_000 },
  ],
};
export const NEXT_VIEW: LivePanelView = { kind: 'next', code: 'P2LM', name: 'Friday Sprint', startsAt: '2026-10-03T09:00:00Z', anchor: { atMs: AT, timeLeftSeconds: 38 * 3600 } };

const div = (name: string, names: string[], start: number) => ({
  name,
  leader: { ...runner(names[0]!, 'o', 'brown', 0, COWBOY), points: start },
  rest: names.slice(1).map((n, i) => ({ ...runner(n, 'o', (['white', 'plum', 'tan', 'green'] as const)[i % 4], 0), place: i + 2, points: start - (i + 1) * 4 })),
});
export const LEAGUE_VIEW: LeaguePanelView = {
  season: 3, round: 6, total: 10, moreDivisions: 0,
  columns: [
    div('Premier', ['Gallopz', 'Neigh Sayer', 'Hay Girl', 'Seabiscuit', 'Trotsky', 'Comet', 'Biscuit', 'Juniper', 'Rocket'], 42),
    div('Championship', ['Oak', 'Fern', 'Newbie', 'Maple', 'Pepper'], 35),
    div('League One', ['Comet', 'Quill', 'Tango', 'Umber'], 29),
  ],
};

export const STATS_VIEW: StatsPanelView = {
  racesRun: 47, mostWins: { ...runner('Gallopz', 'dana', 'brown', 0, COWBOY), wins: 9 }, totalTokens: 1_930_000_000,
  lastTen: [37e6, 52e6, 31e6, 66e6, 45e6, 41e6, 78e6, 58e6, 49e6, 61e6],
};

const result = (date: string, name: string, w: OrgRunner, tokens: number, runners: number, total: number, code: string): ResultRow =>
  ({ code, date, name, winner: w, tokens, runners, total });
export const RACES_VIEW: RacesPanelView = {
  count: 47,
  next: { code: 'P2LM', name: 'Friday Sprint', startsAt: '2026-10-03T09:00:00Z', anchor: { atMs: AT, timeLeftSeconds: 38 * 3600 } },
  latest: [
    result('29 Sep', 'Monday Mile', runner('Hay Girl', 'sam', 'plum', 0, PARTY), 12_100_000, 11, 61_200_000, 'X1AB'),
    result('26 Sep', 'Friday Sprint', runner('Gallopz', 'dana', 'brown', 0, COWBOY), 9_840_000, 12, 58_400_000, 'Z9CD'),
    result('22 Sep', 'Monday Mile', runner('Neigh Sayer', 'omar', 'white', 0), 7_210_000, 9, 41_000_000, 'H3EF'),
  ],
};
