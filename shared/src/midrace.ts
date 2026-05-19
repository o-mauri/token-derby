export const ACHIEVEMENT_NAMES = [
  'Racer!',
  'Overtake!',
  'Pacesetter!',
  'Stampede!',
  'Took the lead!',
  'Comeback!',
  'Pulled Away!',
] as const;

export type AchievementName = typeof ACHIEVEMENT_NAMES[number];

export const ACHIEVEMENT_DESCRIPTIONS: Record<AchievementName, string> = {
  'Racer!': 'Raced continuously for an hour',
  'Overtake!': 'Overtook another horse',
  'Pacesetter!': 'Led the race for an hour straight',
  'Stampede!': 'Gained 7,000+ tokens in a single minute',
  'Took the lead!': 'Charged into first place',
  'Comeback!': 'Climbed from last place to the top half',
  'Pulled Away!': 'Grew the lead by 5,000+ tokens in a minute',
};

// Describe an Overtake! event with multi-position climb.
export function overtakeDescription(positionsClimbed: number): string {
  if (positionsClimbed <= 1) return 'Overtook another horse';
  return `Overtook ${positionsClimbed} horses`;
}

export const MIDRACE_XP = {
  racer: 1,
  overtake: 3,
  pacesetter: 3,
  stampede: 2,
  took_lead: 5,
  comeback: 5,
  pulled_away: 3,
} as const;

export const MIDRACE_CAPS = {
  racer_awards: 5,
  overtake_awards: 5,
  pacesetter_awards: 3,
  lead_take_awards: 3,
  // Stampede! and Pulled Away! are cooldown-based, not per-race-capped.
  // Comeback! is tracked as a boolean (comeback_awarded) — not a counter.
} as const;

export const MIDRACE_THRESHOLDS = {
  warm_up_fraction: 0.08,              // first 8% of race time
  streak_hour_ms: 3_600_000,           // 1 hour for Racer!/Pacesetter!
  racer_dt_cap_ms: 90_000,             // single-tick credit cap for Racer!
  stampede_tokens: 7_000,              // tokens-in-a-minute threshold
  stampede_cooldown_ms: 7_200_000,     // 2 hours
  pulled_away_gap: 5_000,              // gap-growth threshold per minute
  pulled_away_cooldown_ms: 7_200_000,  // 2 hours
  recent_events_retention_ms: 90_000,  // sliding window for recent_events
} as const;

export type RecentEvent = {
  at: number;
  name: AchievementName;
  xp: number;
};
