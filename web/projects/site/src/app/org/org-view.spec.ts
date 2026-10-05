import type { GetRaceResponse, HorseView, RaceSummary, SeasonStandings } from '@token-derby/shared';
import {
  currentLive, leaguePanelView, livePanelView, liveRow, monthKey, monthPage, racesPanelView, statsPanelView, upcomingRows,
} from './org-view';

const C = { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' };
const NOW = new Date(2026, 9, 1, 12, 0).getTime(); // 1 Oct 2026, 12:00 local
const local = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString();

function race(over: Partial<RaceSummary> & { code: string }): RaceSummary {
  return {
    race_id: `r-${over.code}`, name: 'Friday Sprint', join_code: over.code,
    start_time: local(2026, 9, 26), end_time: local(2026, 9, 26, 17), status: 'finished', ...over,
  } as RaceSummary;
}
const win = (horse_name: string, tokens: number) => ({ horse_name, tokens, colors: C });

function horse(id: string, tokens: number, over: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name: `Horse ${id}`, user_name: `u-${id}`, colors: C,
    current_tokens: tokens, scored_tokens: tokens, last_heartbeat: '', joined_at: local(2026, 10, 1, 9), rank: 0, xp: 0, ...over,
  } as HorseView;
}

describe('livePanelView', () => {
  const liveSummary = race({ code: 'K7QX', status: 'live', start_time: local(2026, 10, 1, 9), end_time: local(2026, 10, 1, 17), time_left_seconds: 5 * 3600, runners: 6 });

  it('builds the hero from the live race: leader, four chasers and their gaps', () => {
    const detail = {
      join_code: 'K7QX', name: 'Friday Sprint', status: 'live', time_left_seconds: 5 * 3600,
      start_time: liveSummary.start_time, end_time: liveSummary.end_time,
      horses: [horse('a', 900, { pace_15m: 120 }), horse('b', 600), horse('c', 300), horse('d', 200), horse('e', 100), horse('f', 50)],
    } as unknown as GetRaceResponse;
    const v = livePanelView([liveSummary], detail, NOW);
    if (v.kind !== 'live') throw new Error('expected live');
    expect(v.leader?.name).toBe('Horse a');
    expect(v.leader?.pace).toBe(120);
    expect(v.chasers.map((c) => [c.place, c.gap])).toEqual([[2, 300], [3, 600], [4, 700], [5, 800]]);
    expect(v.runners).toBe(6);
    expect(v.elapsedPct).toBe(38); // 3h of an 8h race
  });

  it('keeps the name and countdown when the live race details are missing', () => {
    const v = livePanelView([liveSummary], null, NOW);
    expect(v).toMatchObject({ kind: 'live', code: 'K7QX', leader: null, chasers: [], runners: 6 });
    if (v.kind === 'live') expect(v.anchor).toEqual({ atMs: NOW, timeLeftSeconds: 5 * 3600 });
  });

  it('falls back to the soonest upcoming race', () => {
    const later = race({ code: 'LATE', status: 'pending', start_time: local(2026, 10, 9) });
    const soon = race({ code: 'SOON', status: 'pending', start_time: local(2026, 10, 3) });
    const v = livePanelView([later, soon], null, NOW);
    expect(v).toMatchObject({ kind: 'next', code: 'SOON' });
    if (v.kind === 'next') expect(v.anchor.timeLeftSeconds).toBe((Date.parse(soon.start_time) - NOW) / 1000);
  });

  it('says none when nothing is live or coming', () => {
    expect(livePanelView([race({ code: 'OLD' })], null, NOW)).toEqual({ kind: 'none' });
  });
});

describe('currentLive', () => {
  it('picks the most recently started of two overlapping live races, everywhere', () => {
    const older = race({ code: 'OLDER', status: 'live', start_time: local(2026, 10, 1, 8) });
    const newer = race({ code: 'NEWER', status: 'live', start_time: local(2026, 10, 1, 10) });
    expect(currentLive([older, newer])?.join_code).toBe('NEWER');
    expect(livePanelView([older, newer], null, NOW)).toMatchObject({ kind: 'live', code: 'NEWER' });
    expect(liveRow([older, newer], NOW)?.code).toBe('NEWER');
  });
});

describe('statsPanelView', () => {
  it('counts finished races, the most frequent winner and total tokens', () => {
    const races = [
      race({ code: 'A', start_time: local(2026, 9, 1), highlight: win('Gallopz', 10), total_tokens: 100 }),
      race({ code: 'B', start_time: local(2026, 9, 5), highlight: win('Hay Girl', 10), total_tokens: 200 }),
      race({ code: 'C', start_time: local(2026, 9, 8), highlight: win('Gallopz', 10), total_tokens: 300 }),
      race({ code: 'P', status: 'pending', start_time: local(2026, 10, 9) }),
    ];
    const v = statsPanelView(races);
    expect(v.racesRun).toBe(3);
    expect(v.mostWins).toMatchObject({ name: 'Gallopz', wins: 2 });
    expect(v.totalTokens).toBe(600);
    expect(v.lastTen).toEqual([100, 200, 300]);
  });

  it('breaks a tie for most wins by who got there first', () => {
    const races = [
      race({ code: 'A', start_time: local(2026, 9, 1), highlight: win('Hay Girl', 1) }),
      race({ code: 'B', start_time: local(2026, 9, 2), highlight: win('Gallopz', 1) }),
      race({ code: 'C', start_time: local(2026, 9, 3), highlight: win('Gallopz', 1) }),
      race({ code: 'D', start_time: local(2026, 9, 4), highlight: win('Hay Girl', 1) }),
    ];
    expect(statsPanelView(races).mostWins?.name).toBe('Gallopz');
  });

  it('keeps the last ten finished races, oldest first', () => {
    const races = Array.from({ length: 12 }, (_, i) => race({ code: `R${i}`, start_time: local(2026, 8, i + 1), total_tokens: i }));
    expect(statsPanelView(races).lastTen).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('reports no total before the API sends totals', () => {
    const v = statsPanelView([race({ code: 'A' }), race({ code: 'B' })]);
    expect(v.totalTokens).toBeNull();
    expect(v.lastTen).toEqual([null, null]);
  });

  it('copes with no finished races', () => {
    expect(statsPanelView([])).toEqual({ racesRun: 0, mostWins: null, totalTokens: null, lastTen: [] });
  });
});

describe('racesPanelView', () => {
  it('shows the next race and the latest three results, newest first', () => {
    const races = [1, 5, 8, 12].map((d) => race({ code: `F${d}`, start_time: local(2026, 9, d), highlight: win('Gallopz', d * 1000), runners: 9, total_tokens: d }))
      .concat(race({ code: 'NEXT', status: 'pending', start_time: local(2026, 10, 3) }));
    const v = racesPanelView(races, NOW);
    expect(v.next?.code).toBe('NEXT');
    expect(v.latest.map((r) => r.code)).toEqual(['F12', 'F8', 'F5']);
    expect(v.latest[0]).toMatchObject({ date: '12 Sep', tokens: 12000, runners: 9, winner: { name: 'Gallopz' } });
    expect(v.count).toBe(5);
  });
});

describe('leaguePanelView', () => {
  const row = (rank: number, name: string, points: number) => ({ rank, stable_horse_id: `s-${name}`, horse_name: name, user_name: 'o', points, season_tokens: 0, zone: null });
  const standings = (divisions: number): SeasonStandings => ({
    org_name: 'Acme', season: 3, round: 6, races_per_season: 10,
    divisions: Array.from({ length: divisions }, (_, i) => ({ division: i + 1, name: `D${i + 1}`, rows: [row(1, `L${i}`, 40), row(2, `R${i}`, 30)] })),
  });

  it('is null without a league', () => {
    expect(leaguePanelView(null)).toBeNull();
  });

  it('shows up to three divisions, each led by its top horse', () => {
    const v = leaguePanelView(standings(5))!;
    expect(v.columns.map((c) => c.name)).toEqual(['D1', 'D2', 'D3']);
    expect(v.moreDivisions).toBe(2);
    expect(v.columns[0]!.leader).toMatchObject({ name: 'L0', points: 40 });
    expect(v.columns[0]!.rest).toEqual([expect.objectContaining({ name: 'R0', place: 2, points: 30 })]);
  });

  it('uses each horse’s own colours when the API sends them, a neutral horse otherwise', () => {
    const s = standings(1);
    s.divisions[0]!.rows[0] = { ...s.divisions[0]!.rows[0]!, colors: C, hat: { id: 'cowboy_hat', obtained_at: 'o' } };
    const v = leaguePanelView(s)!;
    expect(v.columns[0]!.leader?.colors).toEqual(C);
    expect(v.columns[0]!.leader?.hat).toEqual({ id: 'cowboy_hat', variant: undefined });
    expect(v.columns[0]!.rest[0]!.colors.body).not.toBe(C.body);
  });
});

describe('months', () => {
  const sep = [3, 17, 29].map((d) => race({ code: `S${d}`, start_time: local(2026, 9, d), highlight: win('Gallopz', 1) }));
  const aug = [race({ code: 'A1', start_time: local(2026, 8, 20) })];
  const dec = [race({ code: 'D1', start_time: local(2025, 12, 12) })];
  const all = [...sep, ...aug, ...dec, race({ code: 'P', status: 'pending', start_time: local(2026, 10, 3) })];

  it('keys a race by the local month it started in', () => {
    expect(monthKey(local(2026, 9, 30, 23))).toBe('2026-09');
    expect(monthKey(local(2026, 10, 1, 0))).toBe('2026-10');
  });

  it('opens on the latest month with results, newest first', () => {
    const p = monthPage(all, null)!;
    expect(p.month).toBe('2026-09');
    expect(p.label).toBe('SEPTEMBER 2026');
    expect(p.count).toBe(3);
    expect(p.rows.map((r) => r.code)).toEqual(['S29', 'S17', 'S3']);
    expect(p.prev).toEqual({ key: '2026-08', label: 'August' });
    expect(p.next).toBeNull();
  });

  it('steps over empty months and names another year in full', () => {
    const p = monthPage(all, '2026-08')!;
    expect(p.prev).toEqual({ key: '2025-12', label: 'December 2025' });
    expect(p.next).toEqual({ key: '2026-09', label: 'September' });
  });

  it('falls back to the latest month for a bad or empty month', () => {
    expect(monthPage(all, 'abc')!.month).toBe('2026-09');
    expect(monthPage(all, '2019-01')!.month).toBe('2026-09');
  });

  it('is null when nothing has finished', () => {
    expect(monthPage([race({ code: 'P', status: 'pending' })], null)).toBeNull();
  });
});

describe('upcomingRows and liveRow', () => {
  it('lists pending races soonest first with when they start', () => {
    const rows = upcomingRows([race({ code: 'L', status: 'pending', start_time: local(2026, 10, 9) }), race({ code: 'S', status: 'pending', start_time: local(2026, 10, 3) })], NOW);
    expect(rows.map((r) => r.code)).toEqual(['S', 'L']);
    expect(rows[0]).toMatchObject({ date: 'Sat 3 Oct', time: '09:00', startsIn: 'in 1d 21h' });
  });

  it('builds the pinned live row from the summary', () => {
    const r = liveRow([race({ code: 'K7QX', status: 'live', time_left_seconds: 600, highlight: win('Gallopz', 42), runners: 4 })], NOW);
    expect(r).toMatchObject({ code: 'K7QX', tokens: 42, runners: 4, leader: { name: 'Gallopz' }, anchor: { atMs: NOW, timeLeftSeconds: 600 } });
    expect(liveRow([], NOW)).toBeNull();
  });
});
