import { describe, it, expect } from 'vitest';
import { validateLeagueConfig, leagueFixtureName, linearLeaguePoints, buildSeasonStandings, placementPrizeXp, seasonPrizeXp, computeNextDivisions, byStanding, type LeagueConfigInput } from '../src/league.js';
import type { LeagueStanding } from '../src/types.js';

describe('validateLeagueConfig', () => {
  const valid = {
    divisions: [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 12 }, { name: 'League One', cap: 16 }],
    boundaries: [2, 3],
    races_per_season: 8,
    weekdays: [1, 2, 3, 4, 5],
    start_local: '09:00',
    end_local: '17:30',
    max_participants: 30,
  };
  it('accepts a well-formed per-division config', () => {
    expect(validateLeagueConfig(valid)).toBeNull();
  });
  it('requires a non-empty divisions array', () => {
    expect(validateLeagueConfig({ ...valid, divisions: [] })).toMatch(/divisions/);
    expect(validateLeagueConfig({ ...valid, divisions: 'x' })).toMatch(/divisions/);
  });
  it('requires every division name (non-empty, <=40)', () => {
    expect(validateLeagueConfig({ ...valid, divisions: [{ name: '', cap: 8 }, { name: 'B', cap: 8 }], boundaries: [1] })).toMatch(/name/);
    expect(validateLeagueConfig({ ...valid, divisions: [{ name: 'x'.repeat(41), cap: 8 }, { name: 'B', cap: 8 }], boundaries: [1] })).toMatch(/name/);
  });
  it('requires a positive-int cap on every non-last division (last cap optional/overflow)', () => {
    expect(validateLeagueConfig({ ...valid, divisions: [{ name: 'A', cap: 0 }, { name: 'B', cap: 8 }], boundaries: [1] })).toMatch(/cap/);
    // last division cap ignored: a missing/zero last cap is fine
    expect(validateLeagueConfig({ ...valid, divisions: [{ name: 'A', cap: 8 }, { name: 'B', cap: 0 }], boundaries: [1] })).toBeNull();
  });
  it('requires boundaries.length === divisions.length - 1', () => {
    expect(validateLeagueConfig({ ...valid, boundaries: [2] })).toMatch(/boundaries/);
  });
  it('requires each swap to be a positive int no greater than the higher division cap', () => {
    expect(validateLeagueConfig({ ...valid, boundaries: [0, 3] })).toMatch(/swap|boundaries/);
    expect(validateLeagueConfig({ ...valid, boundaries: [9, 3] })).toMatch(/swap|boundaries/); // 9 > Premier cap 8
  });
  it('still validates weekdays, times, and max_participants', () => {
    expect(validateLeagueConfig({ ...valid, weekdays: [] })).toMatch(/weekdays/);
    expect(validateLeagueConfig({ ...valid, start_local: '9:00' })).toMatch(/start_local/);
    expect(validateLeagueConfig({ ...valid, end_local: '08:00' })).toMatch(/after start_local/);
    expect(validateLeagueConfig({ ...valid, max_participants: 0 })).toMatch(/max_participants/);
  });
});

describe('leagueFixtureName', () => {
  it('appends the round marker to the base name', () => {
    expect(leagueFixtureName('Anthropic League', 4, 8)).toBe('Anthropic League (League Race (4/8))');
  });
  it('works for the first and last rounds', () => {
    expect(leagueFixtureName('X', 1, 1)).toBe('X (League Race (1/1))');
    expect(leagueFixtureName('Y League', 10, 10)).toBe('Y League (League Race (10/10))');
  });
});

describe('linearLeaguePoints', () => {
  it('awards field-size points to 1st, descending to 1 for last', () => {
    expect(linearLeaguePoints(1, 8)).toBe(8);
    expect(linearLeaguePoints(2, 8)).toBe(7);
    expect(linearLeaguePoints(8, 8)).toBe(1);
  });
  it('is 1 for the only racer in a division of 1', () => {
    expect(linearLeaguePoints(1, 1)).toBe(1);
  });
});

function st(over: Partial<LeagueStanding>): LeagueStanding {
  return {
    org_id: 'o', season: 1, division: over.division ?? 1, stable_horse_id: over.stable_horse_id ?? 's',
    horse_name: over.horse_name ?? 'H', user_id: 'u', user_name: over.user_name ?? 'U',
    points: over.points ?? 0, season_tokens: over.season_tokens ?? 0, entered_at: over.entered_at ?? '2026-07-07T00:00:00Z',
  };
}

describe('buildSeasonStandings', () => {
  const common = {
    org_name: 'Org',
    divisions: [{ name: 'D1' }, { name: 'D2' }, { name: 'D3' }],
    boundaries: [1, 1],
    races_per_season: 8, season: 1, round: 3,
  };

  it('returns all divisions (top first), even empty ones', () => {
    const out = buildSeasonStandings({ ...common, standings: [st({ division: 3, stable_horse_id: 'a', points: 5 })] });
    expect(out.divisions.map(d => d.division)).toEqual([1, 2, 3]);
    expect(out.divisions.map(d => d.name)).toEqual(['D1', 'D2', 'D3']);
    expect(out.divisions[0]!.rows).toEqual([]);        // empty top flight (season 1)
    expect(out.divisions[2]!.rows).toHaveLength(1);    // bottom pool
    expect(out).toMatchObject({ org_name: 'Org', season: 1, round: 3, races_per_season: 8 });
  });

  it('ranks within a division by points, then season_tokens, then entered_at', () => {
    const out = buildSeasonStandings({ ...common, standings: [
      st({ division: 2, stable_horse_id: 'lo', points: 3 }),
      st({ division: 2, stable_horse_id: 'hi', points: 10 }),
      st({ division: 2, stable_horse_id: 'tieA', points: 3, season_tokens: 900 }),
      st({ division: 2, stable_horse_id: 'tieB', points: 3, season_tokens: 500 }),
    ] });
    const rows = out.divisions[1]!.rows;
    expect(rows.map(r => r.stable_horse_id)).toEqual(['hi', 'tieA', 'tieB', 'lo']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('flags promote/relegate zones, exempting top flight from promotion and bottom from relegation', () => {
    // boundaries [1, 1]. Division 2 (middle): top1 promote, bottom1 relegate.
    const mid = buildSeasonStandings({ ...common, standings: [
      st({ division: 2, stable_horse_id: 'top', points: 9 }),
      st({ division: 2, stable_horse_id: 'midr', points: 5 }),
      st({ division: 2, stable_horse_id: 'bot', points: 1 }),
    ] });
    const midRows = Object.fromEntries(mid.divisions[1]!.rows.map(r => [r.stable_horse_id, r.zone]));
    expect(midRows).toEqual({ top: 'promote', midr: null, bot: 'relegate' });

    // Division 1 (top flight): NO promote zone; only relegation at the bottom.
    const top = buildSeasonStandings({ ...common, standings: [
      st({ division: 1, stable_horse_id: 'champ', points: 9 }),
      st({ division: 1, stable_horse_id: 'drop', points: 1 }),
    ] });
    expect(Object.fromEntries(top.divisions[0]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ champ: null, drop: 'relegate' });

    // Bottom division (3): NO relegate zone; only promotion at the top.
    const bot = buildSeasonStandings({ ...common, standings: [
      st({ division: 3, stable_horse_id: 'rise', points: 9 }),
      st({ division: 3, stable_horse_id: 'last', points: 1 }),
    ] });
    expect(Object.fromEntries(bot.divisions[2]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ rise: 'promote', last: null });
  });

  it('clamps zones so they never overlap in a small division (promotion is prioritized)', () => {
    // boundaries [2, 2] but only 3 rows in a middle division → demand (2+2=4) exceeds k (3).
    // The per-boundary clamp shrinks relegation first, so promotion keeps its full count.
    const out = buildSeasonStandings({ ...common, boundaries: [2, 2], standings: [
      st({ division: 2, stable_horse_id: 'a', points: 9 }),
      st({ division: 2, stable_horse_id: 'b', points: 5 }),
      st({ division: 2, stable_horse_id: 'c', points: 1 }),
    ] });
    expect(Object.fromEntries(out.divisions[1]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ a: 'promote', b: 'promote', c: 'relegate' });
  });

  it('does NOT shrink single-zone divisions (only the overlap case is clamped)', () => {
    // Bottom pool (division 3 of 3), k=3, boundary 2 → 2 promotions; no relegate zone to overlap,
    // so the clamp must NOT apply (this is the common season-1 bottom-pool case).
    const bottom = buildSeasonStandings({ ...common, boundaries: [2, 2], standings: [
      st({ division: 3, stable_horse_id: 'p1', points: 9 }),
      st({ division: 3, stable_horse_id: 'p2', points: 5 }),
      st({ division: 3, stable_horse_id: 'safe', points: 1 }),
    ] });
    expect(Object.fromEntries(bottom.divisions[2]!.rows.map(r => [r.stable_horse_id, r.zone])))
      .toEqual({ p1: 'promote', p2: 'promote', safe: null });

    // Top flight (division 1), k=3, boundary 2 → 2 relegations; no promote zone.
    const top = buildSeasonStandings({ ...common, boundaries: [2, 2], standings: [
      st({ division: 1, stable_horse_id: 'safe', points: 9 }),
      st({ division: 1, stable_horse_id: 'r1', points: 5 }),
      st({ division: 1, stable_horse_id: 'r2', points: 1 }),
    ] });
    expect(Object.fromEntries(top.divisions[0]!.rows.map(r => [r.stable_horse_id, r.zone])))
      .toEqual({ safe: null, r1: 'relegate', r2: 'relegate' });
  });

  it('zones use the per-boundary swap: promotion size from the top boundary, relegation from the bottom', () => {
    const out = buildSeasonStandings({
      org_name: 'Org', divisions: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      boundaries: [1, 2], races_per_season: 8, season: 2, round: 3,
      standings: [
        st({ division: 2, stable_horse_id: 'p', points: 9 }),   // B: top1 promote (boundary A|B = 1)
        st({ division: 2, stable_horse_id: 'm', points: 5 }),
        st({ division: 2, stable_horse_id: 'r1', points: 3 }),   // bottom2 relegate (boundary B|C = 2)
        st({ division: 2, stable_horse_id: 'r2', points: 1 }),
      ],
    });
    expect(Object.fromEntries(out.divisions[1].rows.map(r => [r.stable_horse_id, r.zone])))
      .toEqual({ p: 'promote', m: null, r1: 'relegate', r2: 'relegate' });
    expect(out.divisions[1].name).toBe('B');
  });
});

describe('placementPrizeXp', () => {
  it('is 1000 for the winner and 75 for last place', () => {
    expect(placementPrizeXp(1, 10)).toBe(1000);
    expect(placementPrizeXp(10, 10)).toBe(75);
  });
  it('is front-loaded (bigger gaps at the top) for a field of 10', () => {
    expect(placementPrizeXp(2, 10)).toBe(750);
    expect(placementPrizeXp(3, 10)).toBe(562);
  });
  it('gives the winner 1000 in a field of 1', () => {
    expect(placementPrizeXp(1, 1)).toBe(1000);
  });
});

describe('seasonPrizeXp', () => {
  const base = { rank: 1, fieldSize: 10, isTopFlight: false, promoted: false, gateMultiplier: 1 };
  it('is the placement XP with no modifiers', () => {
    expect(seasonPrizeXp(base)).toBe(1000);
  });
  it('applies the top-flight 1.25x to the placement', () => {
    expect(seasonPrizeXp({ ...base, isTopFlight: true })).toBe(1250);
  });
  it('adds the +50 promotion bonus on top (after the multiplier)', () => {
    expect(seasonPrizeXp({ ...base, promoted: true })).toBe(1050);
    expect(seasonPrizeXp({ ...base, isTopFlight: true, promoted: true })).toBe(1300);
  });
  it('scales the whole prize by the anti-farm gate multiplier', () => {
    // NOTE: deviates from the task-1-brief verbatim text, which had
    // `{ ...base, gateMultiplier: 0.5 }` expecting 525 here. With `promoted: false`
    // (from `base`), placementPrizeXp(1, 10) * 0.5 = 500, not 525 — 525 only
    // arises from (1000 + 50) * 0.5, i.e. it requires `promoted: true`. That also
    // matches this test's own intent (showing the +50 bonus is scaled too, not
    // just the placement, which the other assertion below already covers via
    // gateMultiplier: 0). Flagged for review; added `promoted: true` here.
    expect(seasonPrizeXp({ ...base, promoted: true, gateMultiplier: 0.5 })).toBe(525);
    expect(seasonPrizeXp({ ...base, promoted: true, gateMultiplier: 0 })).toBe(0);
  });
});

describe('computeNextDivisions', () => {
  // 3 divisions, caps 2 / 2 / overflow; single swap of 1 across each boundary.
  const divisions = [{ name: 'D1', cap: 2 }, { name: 'D2', cap: 2 }, { name: 'D3', cap: 999 }];

  it('season 1: full-seeds the single pool by points into the per-division caps', () => {
    // 5 horses all in the bottom pool (division 3), points 50..10.
    const standings = [50, 40, 30, 20, 10].map((p, i) =>
      st({ division: 3, stable_horse_id: `h${i}`, points: p }));
    const next = computeNextDivisions({ divisions, boundaries: [1, 1], season: 1, shapeChanged: false, standings });
    expect(next.get('h0')).toBe(1); expect(next.get('h1')).toBe(1); // cap 2 → top 2 to Div 1
    expect(next.get('h2')).toBe(2); expect(next.get('h3')).toBe(2); // next 2 to Div 2
    expect(next.get('h4')).toBe(3);                                  // remainder → bottom
  });

  it('season 1: honours differing per-division caps', () => {
    const caps = [{ name: 'D1', cap: 1 }, { name: 'D2', cap: 3 }, { name: 'D3', cap: 999 }];
    const standings = [60, 50, 40, 30, 20, 10].map((p, i) =>
      st({ division: 3, stable_horse_id: `h${i}`, points: p }));
    const next = computeNextDivisions({ divisions: caps, boundaries: [1, 1], season: 1, shapeChanged: false, standings });
    expect(next.get('h0')).toBe(1);                                  // Div 1 cap 1
    expect(next.get('h1')).toBe(2); expect(next.get('h2')).toBe(2); expect(next.get('h3')).toBe(2); // Div 2 cap 3
    expect(next.get('h4')).toBe(3); expect(next.get('h5')).toBe(3); // overflow
  });

  it('steady state: swaps boundaries[i] across each boundary (sizes stable)', () => {
    // boundaries [1, 2]: Div1|Div2 swaps 1, Div2|Div3 swaps 2.
    const standings = [
      st({ division: 1, stable_horse_id: 'a', points: 9 }), st({ division: 1, stable_horse_id: 'b', points: 5 }), st({ division: 1, stable_horse_id: 'c', points: 1 }),
      st({ division: 2, stable_horse_id: 'd', points: 9 }), st({ division: 2, stable_horse_id: 'e', points: 6 }), st({ division: 2, stable_horse_id: 'f', points: 3 }), st({ division: 2, stable_horse_id: 'g', points: 1 }),
      st({ division: 3, stable_horse_id: 'h', points: 9 }), st({ division: 3, stable_horse_id: 'i', points: 5 }), st({ division: 3, stable_horse_id: 'j', points: 1 }),
    ];
    const next = computeNextDivisions({ divisions, boundaries: [1, 2], season: 2, shapeChanged: false, standings });
    // Div1: no promotion; bottom 1 (c) relegates.
    expect(next.get('a')).toBe(1); expect(next.get('b')).toBe(1); expect(next.get('c')).toBe(2);
    // Div2: top 1 (d) promotes across boundary[0]=1; bottom 2 (f,g) relegate across boundary[1]=2; e stays.
    expect(next.get('d')).toBe(1); expect(next.get('e')).toBe(2); expect(next.get('f')).toBe(3); expect(next.get('g')).toBe(3);
    // Div3 (bottom): top 2 (h,i) promote across boundary[1]=2; j stays.
    expect(next.get('h')).toBe(2); expect(next.get('i')).toBe(2); expect(next.get('j')).toBe(3);
  });

  it('steady state: clamps so promote/relegate never overlap in a small division (promotion wins)', () => {
    // Div2 with 3 horses, both boundaries 2 → promoteN=2, relegateN clamped to 1.
    const standings = [
      st({ division: 2, stable_horse_id: 'x', points: 9 }),
      st({ division: 2, stable_horse_id: 'y', points: 5 }),
      st({ division: 2, stable_horse_id: 'z', points: 1 }),
    ];
    const next = computeNextDivisions({ divisions, boundaries: [2, 2], season: 2, shapeChanged: false, standings });
    expect(next.get('x')).toBe(1); expect(next.get('y')).toBe(1); expect(next.get('z')).toBe(3);
  });

  it('shape change: re-seeds everyone top-down by cross-division merit into the new shape', () => {
    // Old: Div1 a(9) b(5); Div2 c(9) d(5). New caps 1/1/overflow → merit a,b,c,d
    // fills Div1=a, Div2=b, Div3(bottom)=c,d.
    const standings = [
      st({ division: 1, stable_horse_id: 'a', points: 9 }), st({ division: 1, stable_horse_id: 'b', points: 5 }),
      st({ division: 2, stable_horse_id: 'c', points: 9 }), st({ division: 2, stable_horse_id: 'd', points: 5 }),
    ];
    const newDivs = [{ name: 'D1', cap: 1 }, { name: 'D2', cap: 1 }, { name: 'D3', cap: 999 }];
    const next = computeNextDivisions({ divisions: newDivs, boundaries: [1, 1], season: 3, shapeChanged: true, standings });
    expect(next.get('a')).toBe(1);
    expect(next.get('b')).toBe(2);
    expect(next.get('c')).toBe(3);
    expect(next.get('d')).toBe(3);
  });
});

describe('byStanding (exported comparator)', () => {
  it('orders by points desc, then season_tokens desc, then entered_at asc', () => {
    const rows = [
      st({ stable_horse_id: 'c', points: 5, season_tokens: 100, entered_at: '2026-01-01T00:00:02Z' }),
      st({ stable_horse_id: 'a', points: 9, season_tokens: 0, entered_at: '2026-01-01T00:00:00Z' }),
      st({ stable_horse_id: 'b', points: 5, season_tokens: 100, entered_at: '2026-01-01T00:00:01Z' }),
      st({ stable_horse_id: 'd', points: 5, season_tokens: 999, entered_at: '2026-01-01T00:00:05Z' }),
    ];
    expect([...rows].sort(byStanding).map(r => r.stable_horse_id)).toEqual(['a', 'd', 'b', 'c']);
  });
});
