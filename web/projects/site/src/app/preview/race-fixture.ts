// Preview data for /preview-race, ported from the old site's preview-race.ts. Not part of production builds.
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, CollectedHat, SeriesPoint } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';

export type PreviewRaceState = 'live' | 'pending' | 'finished';

const COLORS_A = { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' };
const COLORS_B = { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' };
const COLORS_C = { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' };
const COLORS_D = { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' };
const COLORS_E = { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' };
const COLORS_F = { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' };

const JOIN_CODE = 'PRVRCE';
const RACE_START_MS = Date.now() - 2 * 60 * 60 * 1000;   // started 2h ago
const RACE_END_MS   = Date.now() + 6 * 60 * 60 * 1000;   // ends in 6h

function horse(
  joinOrder: number,
  name: string,
  user_name: string,
  tokens: number,
  xp: number,
  colors: { body: string; mane: string; tail: string; saddle: string },
  equipped_hat?: CollectedHat,
  stamina?: number,
  scoredTokens?: number,
): HorseView {
  const id = name.toLowerCase();
  return {
    horse_id: `horse-${id}`,
    stable_horse_id: `stable-${id}`,
    name,
    colors,
    current_tokens: tokens,
    // Tired horses score less than they produced — most fixtures mirror
    // current_tokens, but a scoredTokens override shows the gap on screen.
    scored_tokens: scoredTokens ?? tokens,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date(RACE_START_MS + joinOrder * 1000).toISOString(),
    rank: 0,
    user_id: `user-${id}`,
    user_name,
    xp,
    ...(equipped_hat ? { equipped_hat } : {}),
    ...(stamina !== undefined ? { modifier_states: { stamina: { level: stamina } } } : {}),
  };
}

const OBTAINED = new Date(RACE_START_MS - 24 * 60 * 60 * 1000).toISOString();

function liveSnapshot(now: number): GetRaceResponse {
  const horses = [
    // Stormbringer in the lead, sporting a rainbow crown (animated legendary)
    horse(1, 'Stormbringer', 'Alice', 4280, 40,   COLORS_A,
      { id: 'rainbow_crown', obtained_at: OBTAINED }, 88),
    // Pegasus chasing in a cowboy hat #1
    horse(2, 'Pegasus',      'Bob',   3915, 170,  COLORS_B,
      { id: 'cowboy_hat', variant: 0, obtained_at: OBTAINED }, 62),
    // Cloudrunner in a sailor hat #1 (white + navy)
    horse(3, 'Cloudrunner',  'Carol', 3502, 300,  COLORS_C,
      { id: 'sailor_hat', variant: 0, obtained_at: OBTAINED }, 41),
    // Thunderbolt: heavy hitter wearing a spartan helmet (epic, anchor extends forward),
    // tapering hard — scored falls below Embers despite more raw tokens, so ranking
    // by scored (not current_tokens) visibly swaps their order.
    horse(4, 'Thunderbolt',  'Dan',   2880, 1000, COLORS_D,
      { id: 'spartan_helmet', variant: 0, obtained_at: OBTAINED }, 30, 900),
    // Embers: lit up with the inferno cap (animated legendary), tapering — scored
    // trails raw so the label demonstrably differs from current_tokens.
    horse(5, 'Embers',       'Eve',   1240, 655,  COLORS_E,
      { id: 'inferno_cap', obtained_at: OBTAINED }, 14, 980),
    // Misty: bareheaded, also tapering — control case so you can compare
    // with-hat vs without, and scored vs raw.
    horse(6, 'Misty',        'Frank', 412,  10,   COLORS_F, undefined, 6, 350),
  ];
  const ranked: HorseView[] = horses
    .slice()
    .sort((a, b) => scoredOf(b) - scoredOf(a))
    .map((h, i) => ({ ...h, rank: i + 1 }));

  return {
    race_id: 'preview-race',
    name: 'Preview Derby',
    start_time: new Date(RACE_START_MS).toISOString(),
    end_time: new Date(RACE_END_MS).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: JOIN_CODE,
    organisation_name: 'Acme',
    created_at: new Date(RACE_START_MS - 60 * 60 * 1000).toISOString(),
    status: 'live',
    server_time: new Date(now).toISOString(),
    time_left_seconds: Math.max(0, Math.floor((RACE_END_MS - now) / 1000)),
    // The shape a race created today actually carries. Org tuned the taper
    // floor up from the 25 default, so the bar is demonstrably reading the
    // race's own snapshotted config rather than the modifier's.
    modifiers: { stamina: { enabled: true, params: { taper_floor: 40 } } },
    horses: ranked,
  };
}

// Dummy per-horse token series covering the elapsed part of the (live) race, so
// the mid-race graph popup has data without a real API. Live races clamp their
// chart window to "now", so points are only emitted up to this load time.
const SERIES_NOW_MS = Date.now();

function seriesFor(h: HorseView, seed: number): SeriesPoint[] {
  const elapsedMinutes = Math.max(1, Math.floor((SERIES_NOW_MS - RACE_START_MS) / 60_000));
  const weights = Array.from({ length: elapsedMinutes }, (_, m) => {
    const active = Math.sin(m * 0.06 + seed * 1.7) > -0.25;
    const burst = Math.max(0, Math.sin(m * 0.4 + seed) * Math.cos(m * 0.13 + seed));
    return active ? burst : 0;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const total = h.current_tokens;
  const points: SeriesPoint[] = [];
  weights.forEach((w, m) => {
    if (w <= 0) return; // idle minute — no point recorded
    points.push({ t: RACE_START_MS + m * 60_000 + 30_000, d: Math.round((w / sum) * total) });
  });
  return taper(points, scoredOf(h));
}

/**
 * Score a horse's later points down until the series totals its scored
 * distance, the shape a tiring horse actually produces: full value until it
 * drops through the taper floor, then progressively less.
 *
 * The taper starts at the latest point from which the remaining output can
 * absorb the whole reduction — walking back from the end rather than from a
 * fixed fraction, which would clamp at zero and leave the line above target for
 * a horse that lost most of its score. Earlier points carry no `s`, exactly as
 * the server writes them.
 */
function taper(points: SeriesPoint[], scoredTotal: number): SeriesPoint[] {
  const raw = points.reduce((a, p) => a + p.d, 0);
  if (raw <= 0 || scoredTotal >= raw) return points;

  const reduction = raw - scoredTotal;
  let start = points.length;
  let tailRaw = 0;
  while (start > 0 && tailRaw < reduction) {
    start--;
    tailRaw += points[start]!.d;
  }
  if (tailRaw <= 0) return points;

  const ratio = (tailRaw - reduction) / tailRaw;
  return points.map((p, i) => (i < start ? p : { ...p, s: Math.round(p.d * ratio) }));
}

const SERIES: GetRaceSeriesResponse = {
  start_ms: RACE_START_MS,
  end_ms: RACE_END_MS,
  horses: liveSnapshot(SERIES_NOW_MS).horses.map((h, i) => ({ horse_id: h.horse_id, points: seriesFor(h, i) })),
};


// Achievements a few minutes old, so the ticker has a batch to roll after the order.
const EVENTS: Record<string, { at: number; name: 'Overtake!' | 'Stampede!' | 'Took the lead!' | 'Pulled Away!'; xp: number }[]> = {
  'horse-stormbringer': [{ at: Date.now() - 4 * 60_000, name: 'Took the lead!', xp: 15 }],
  'horse-pegasus': [{ at: Date.now() - 3 * 60_000, name: 'Overtake!', xp: 10 }],
  'horse-embers': [{ at: Date.now() - 2 * 60_000, name: 'Stampede!', xp: 25 }],
};

// XP awarded at the finish, as in the old finished preview: some level up, some don't.
const AWARDED: Record<string, number> = { Stormbringer: 95, Pegasus: 79, Cloudrunner: 62, Thunderbolt: 35, Embers: 29, Misty: 26 };

const FILLER_NAMES = ['Comet', 'Biscuit', 'Juniper', 'Rocket', 'Maple', 'Nimbus', 'Pepper', 'Quasar', 'Ripple', 'Saffron',
  'Tango', 'Umber', 'Velvet', 'Willow', 'Xenon', 'Yarrow', 'Zephyr', 'Acorn', 'Bramble', 'Cinder', 'Dusk', 'Ember', 'Flint', 'Gale',
  'Hazel', 'Indigo', 'Jasper', 'Kestrel', 'Lark', 'Moss', 'Nova', 'Onyx', 'Pippin', 'Quill'];
const FILLER_COLORS = [COLORS_A, COLORS_B, COLORS_C, COLORS_D, COLORS_E, COLORS_F];
const FILLER_HATS = ['cowboy_hat', 'sailor_hat', 'spartan_helmet', 'inferno_cap'] as const;

// Extra runners for ?horses=N, trailing the six named ones so the field needs to scroll.
function fillers(count: number): HorseView[] {
  return Array.from({ length: count }, (_, i) => {
    const hat = i % 3 === 0 ? { id: FILLER_HATS[i % FILLER_HATS.length], variant: 0, obtained_at: OBTAINED } as CollectedHat : undefined;
    return horse(7 + i, FILLER_NAMES[i % FILLER_NAMES.length] + (i >= FILLER_NAMES.length ? ` ${i}` : ''), `Rider ${i + 1}`,
      Math.round(3200 - i * 2900 / Math.max(count, 1)), 60 + i * 37, FILLER_COLORS[i % FILLER_COLORS.length], hat, 30 + (i * 17) % 70);
  });
}

/** The preview race in the given state, as the API would return it at `now`, padded to `field` horses. */
export function previewRace(state: PreviewRaceState, now = Date.now(), field = 6): GetRaceResponse {
  const base = liveSnapshot(now);
  // The whole padded field is ranked on scored tokens, as the API would.
  const padded = [...base.horses, ...fillers(Math.max(0, field - base.horses.length))]
    .sort((a, b) => scoredOf(b) - scoredOf(a))
    .map((h, i) => ({ ...h, rank: i + 1 }));
  const live = { ...base, horses: padded };
  if (state === 'live') {
    return { ...live, horses: live.horses.map((h) => ({ ...h, recent_events: EVENTS[h.horse_id] ?? [] }) as HorseView) };
  }
  if (state === 'pending') {
    const start = now + 20 * 60_000;
    return {
      ...live, status: 'pending', start_time: new Date(start).toISOString(), end_time: new Date(start + 8 * 3600_000).toISOString(),
      time_left_seconds: 8 * 3600,
      horses: live.horses.map((h) => ({ ...h, current_tokens: 0, scored_tokens: 0, modifier_states: undefined }) as HorseView),
    };
  }
  return {
    ...live, status: 'finished', time_left_seconds: 0,
    horses: live.horses.map((h) => ({ ...h, final_scored_tokens: scoredOf(h), xp_awarded: AWARDED[h.name] ?? 20 }) as HorseView),
  };
}

export const PREVIEW_JOIN_CODE = JOIN_CODE;
export const PREVIEW_SERIES = SERIES;
