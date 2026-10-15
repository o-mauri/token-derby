// Preview data for /preview-org and /preview-org/races. Not part of production builds.
import type { CollectedHat, GetRaceResponse, HorseColors, HorseView, ListOrgRacesResponse, RaceSummary, SeasonStandings } from '@token-derby/shared';
import { PREVIEW_JOIN_CODE, previewRace } from './race-fixture';

export const PREVIEW_ORG = 'Stackone';
export type OrgPreviewOptions = { state: 'live' | 'next' | 'none'; league: boolean; long: boolean; divisions?: number };
export const PREVIEW_SEASON = 3;

const COLORS: HorseColors[] = [
  { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
  { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
];
const HATS: (CollectedHat | undefined)[] = [
  { id: 'cowboy_hat', obtained_at: '' }, undefined, { id: 'party_hat', obtained_at: '' }, { id: 'sailor_hat', obtained_at: '' }, undefined, undefined,
];
const STABLE = ['Gallopz', 'Neigh Sayer', 'Hay Girl', 'Seabiscuit', 'Trotsky', 'Comet', 'Juniper', 'Rocket', 'Maple', 'Pepper', 'Quill', 'Tango'];
const LONG = ['Sir Gallopsalot the Magnificent Steed Jr', 'Neigh Sayer of the Northern Downs III'];
const OWNERS = ['dana', 'omar', 'sam', 'kit', 'lee', 'ana', 'raj', 'mo', 'jo', 'li', 'ed', 'flo'];

const look = (i: number) => ({ colors: COLORS[i % COLORS.length]!, hat: HATS[i % HATS.length] });
const nameOf = (i: number, long: boolean) => (long && i < LONG.length ? LONG[i]! : STABLE[i % STABLE.length]!);
// A fixed spread of winners, so the preview looks the same on every load.
const WINNER_ORDER = [0, 2, 1, 0, 3, 0, 4, 2, 5, 1, 0, 6, 2, 7, 0, 3, 1, 8, 2, 0];

function at(daysFromNow: number, hour = 9): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function finishedRaces(long: boolean): RaceSummary[] {
  const out: RaceSummary[] = [];
  for (let back = 1; back <= 190 && out.length < 52; back++) {
    const day = at(-back);
    const weekday = day.getDay();
    if (weekday !== 1 && weekday !== 5) continue;
    const i = out.length;
    const winner = WINNER_ORDER[i % WINNER_ORDER.length]!;
    const tokens = 6_000_000 + ((i * 7919) % 7_000_000);
    const { colors, hat } = look(winner);
    out.push({
      race_id: `f${i}`, name: weekday === 1 ? 'Monday Mile' : 'Friday Sprint', join_code: `F${String(i).padStart(3, '0')}`,
      start_time: day.toISOString(), end_time: at(-back, 17).toISOString(), status: 'finished',
      highlight: { horse_name: nameOf(winner, long), tokens, colors, ...(hat ? { hat } : {}) },
      runners: 8 + (i % 5), total_tokens: tokens * (4 + (i % 3)),
    });
  }
  return out;
}

export function previewOrgRaces(opts: OrgPreviewOptions): ListOrgRacesResponse {
  const races = finishedRaces(opts.long);
  if (opts.state === 'live') {
    const live = previewLiveRace(opts);
    const lead = [...live.horses].sort((a, b) => (b.scored_tokens ?? 0) - (a.scored_tokens ?? 0))[0]!;
    races.push({
      race_id: 'live', name: live.name, join_code: PREVIEW_JOIN_CODE, start_time: live.start_time, end_time: live.end_time,
      status: 'live', time_left_seconds: live.time_left_seconds, runners: live.horses.length,
      highlight: { horse_name: lead.name, tokens: lead.scored_tokens ?? lead.current_tokens, colors: lead.colors },
    });
  }
  if (opts.state !== 'none') {
    // The next two race days (Mondays and Fridays), named for their day.
    let found = 0;
    for (let days = 1; found < 2 && days < 14; days++) {
      const day = at(days).getDay();
      if (day !== 1 && day !== 5) continue;
      const code = found === 0 ? 'P2LM' : 'Q8RT';
      races.push({ race_id: code, name: day === 1 ? 'Monday Mile' : 'Friday Sprint', join_code: code, start_time: at(days).toISOString(), end_time: at(days, 17).toISOString(), status: 'pending' });
      found++;
    }
  }
  return { org_name: PREVIEW_ORG, races };
}

/** The live race behind the LIVE panel: the race preview's live field, renamed for the long-names check. */
export function previewLiveRace(opts: OrgPreviewOptions): GetRaceResponse {
  const race = previewRace('live');
  if (!opts.long) return race;
  return {
    ...race,
    name: 'Anthropic Summer Championship (League Race (4/8))',
    horses: race.horses.map((h, i) => (i < LONG.length ? ({ ...h, name: LONG[i]! } as HorseView) : h)),
  };
}

const DIVISION_NAMES = ['Premier', 'Championship', 'League One', 'League Two', 'National'];
const DIVISION_SIZES = [9, 7, 6, 5, 4];

/** A season's standings: the current one (3) is in round 6 with three divisions (or ?divisions=N); earlier ones are
 *  finished, with two divisions, and a reshuffled order so they look different. */
export function previewOrgStandings(opts: OrgPreviewOptions, season = PREVIEW_SEASON): SeasonStandings | null {
  if (!opts.league || season < 1 || season > PREVIEW_SEASON) return null;
  const count = season === PREVIEW_SEASON ? Math.min(5, Math.max(1, opts.divisions ?? 3)) : 2;
  const division = (d: number) => {
    const size = DIVISION_SIZES[d]!;
    return {
      division: d + 1, name: DIVISION_NAMES[d]!,
      rows: Array.from({ length: size }, (_, r) => {
        const i = d * 4 + ((r + season * 3) % size);
        const { colors, hat } = look(i);
        const zone = d > 0 && r < 2 ? ('promote' as const) : d < count - 1 && r >= size - 2 ? ('relegate' as const) : null;
        return {
          rank: r + 1, stable_horse_id: `s${i}`, horse_name: nameOf(i % STABLE.length, opts.long && d === 0), user_name: OWNERS[i % OWNERS.length]!,
          points: 44 - r * 4 - d * 3, season_tokens: 90_000_000 - r * 6_000_000, zone, colors, ...(hat ? { hat } : {}),
        };
      }),
    };
  };
  return {
    org_name: PREVIEW_ORG, season, round: season === PREVIEW_SEASON ? 6 : 10, races_per_season: 10,
    divisions: Array.from({ length: count }, (_, d) => division(d)),
  };
}
