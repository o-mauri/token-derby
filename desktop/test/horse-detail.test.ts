import { describe, it, expect } from 'vitest';
import type { HorseColors, HorseView, RaceView } from '@token-derby/shared';
import { detailRows } from '../src/screens/horse-detail.js';
import { mapStandings } from '../src/screens/race-standings.js';
import { formatTokens } from '../src/lib/format.js';

const COLORS: HorseColors = { body: '#8B4513', mane: '#f5e9d3', tail: '#f5e9d3', saddle: '#3d2856' };

const SERVER_TIME = '2026-08-11T12:00:00.000Z';

function horse(overrides: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'h-1',
    stable_horse_id: 'sh-1',
    rank: 1,
    name: 'Thunder',
    colors: COLORS,
    current_tokens: 1_204_338,
    last_heartbeat: '2026-08-11T11:59:37.000Z', // 23s before SERVER_TIME
    joined_at: '2026-08-11T11:00:00.000Z',
    user_id: 'u-1',
    user_name: 'Me',
    xp: 0,
    ...overrides,
  } as HorseView;
}

function race(overrides: Partial<RaceView> = {}): RaceView {
  return {
    race_id: 'race-1',
    name: 'Test Race',
    start_time: '2026-08-11T11:00:00.000Z',
    end_time: '2026-08-11T13:00:00.000Z',
    tz: 'UTC',
    max_participants: 8,
    join_code: 'ABC123',
    created_at: '2026-08-11T11:00:00.000Z',
    status: 'live',
    horses: [],
    server_time: SERVER_TIME,
    time_left_seconds: 3600,
    ...overrides,
  } as RaceView;
}

function rowFor(rows: ReturnType<typeof detailRows>, label: string) {
  return rows.find((r) => r.label === label);
}

describe('detailRows — stamina', () => {
  it('omits stamina entirely when the race does not use it', () => {
    const rows = detailRows(race({ stamina: false }), horse({ stamina: 68 }));
    expect(rowFor(rows, 'Stamina')).toBeUndefined();
  });

  it('shows stamina as a whole percentage with a bar fraction when the race uses it', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: 68.4 }));
    const row = rowFor(rows, 'Stamina')!;
    expect(row.value).toContain('68%');
    expect(row.bar).toBeCloseTo(0.684, 3);
  });

  it('treats a horse with no stamina reading as full', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: undefined }));
    expect(rowFor(rows, 'Stamina')!.value).toContain('100%');
  });

  // Bands match cli/src/ui/StatusScreen.tsx: green above 50, amber down to the
  // org's taper floor, red below it. Defaults put the floor at 25.
  it('is good above 50', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: 51 }));
    expect(rowFor(rows, 'Stamina')!.tone).toBe('good');
  });

  it('is warn at exactly 50', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: 50 }));
    expect(rowFor(rows, 'Stamina')!.tone).toBe('warn');
  });

  it('is warn at exactly the taper floor', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: 25 }));
    expect(rowFor(rows, 'Stamina')!.tone).toBe('warn');
  });

  it('is bad below the taper floor', () => {
    const rows = detailRows(race({ stamina: true }), horse({ stamina: 24 }));
    expect(rowFor(rows, 'Stamina')!.tone).toBe('bad');
  });

  it('shows the scoring multiplier only once tapering has begun', () => {
    const tapering = detailRows(race({ stamina: true }), horse({ stamina: 24 }));
    // 0.5 + (1 - 0.5) * (24 / 25) = 0.98
    expect(rowFor(tapering, 'Stamina')!.value).toContain('×0.98');

    const healthy = detailRows(race({ stamina: true }), horse({ stamina: 60 }));
    expect(rowFor(healthy, 'Stamina')!.value).not.toContain('×');
  });

  it('honours an org taper floor override', () => {
    const cfg = { stamina: true, stamina_config: { taper_floor: 40 } } as Partial<RaceView>;
    // 30 is above the default floor of 25 but below an overridden floor of 40.
    expect(rowFor(detailRows(race(cfg), horse({ stamina: 30 })), 'Stamina')!.tone).toBe('bad');
  });
});

describe('detailRows — tokens', () => {
  it('shows the exact scored figure with thousands separators, not an abbreviation', () => {
    const rows = detailRows(race(), horse({ current_tokens: 1_204_338, scored_tokens: 1_180_921 }));
    expect(rowFor(rows, 'Tokens')!.value).toBe('1,180,921');
  });

  // The whole point of the panel: the same number as the list, untruncated.
  it('shows the untruncated form of exactly what the standings list shows', () => {
    const h = horse({ current_tokens: 1_204_338, scored_tokens: 1_180_921 });
    const r = race({ horses: [h] });
    const listed = mapStandings(r, new Set())[0].tokens;

    expect(formatTokens(listed)).toBe('1.18M');
    expect(rowFor(detailRows(r, h), 'Tokens')!.value).toBe(listed.toLocaleString('en-US'));
  });

  it('uses the final scored figure once the race has finished', () => {
    const h = horse({ current_tokens: 1000, scored_tokens: 800, final_scored_tokens: 1500 });
    const rows = detailRows(race({ status: 'finished' }), h);
    expect(rowFor(rows, 'Tokens')!.value).toBe('1,500');
  });
});

describe('detailRows — pace', () => {
  it('omits pace when the server did not report one', () => {
    expect(rowFor(detailRows(race(), horse({ pace_15m: undefined })), 'Pace')).toBeUndefined();
  });

  it('shows pace per minute with separators', () => {
    expect(rowFor(detailRows(race(), horse({ pace_15m: 4120 })), 'Pace')!.value).toBe('4,120 /min');
  });

  it('rounds a fractional pace to whole tokens', () => {
    expect(rowFor(detailRows(race(), horse({ pace_15m: 4120.7 })), 'Pace')!.value).toBe('4,121 /min');
  });
});

describe('detailRows — beat', () => {
  it('reports the heartbeat age against server time, not the local clock', () => {
    expect(rowFor(detailRows(race(), horse()), 'Beat')!.value).toContain('23s ago');
  });

  it('marks a horse still beating within two intervals as good', () => {
    const h = horse({ last_heartbeat: '2026-08-11T11:58:30.000Z' }); // 90s
    expect(rowFor(detailRows(race(), h), 'Beat')!.tone).toBe('good');
  });

  it('marks a horse that has missed two intervals as warn', () => {
    const h = horse({ last_heartbeat: '2026-08-11T11:57:00.000Z' }); // 180s
    const row = rowFor(detailRows(race(), h), 'Beat')!;
    expect(row.tone).toBe('warn');
  });

  it('never reports a negative age when a heartbeat leads server time', () => {
    const h = horse({ last_heartbeat: '2026-08-11T12:00:05.000Z' });
    expect(rowFor(detailRows(race(), h), 'Beat')!.value).toContain('0s ago');
  });

  it('falls back to a dash for an unparseable heartbeat', () => {
    const h = horse({ last_heartbeat: 'not-a-date' });
    expect(rowFor(detailRows(race(), h), 'Beat')!.value).toBe('—');
  });
});
