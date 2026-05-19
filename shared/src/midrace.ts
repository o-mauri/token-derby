// shared/src/midrace.ts
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
  tookLead: 5,
  comeback: 5,
  pulledAway: 3,
} as const;

export const MIDRACE_CAPS = {
  racerAwards: 5,
  overtakeAwards: 5,
  pacesetterAwards: 3,
  leadTakeAwards: 3,
  // Stampede! and Pulled Away! are cooldown-based, not per-race-capped.
} as const;

export const MIDRACE_THRESHOLDS = {
  warmUpFraction: 0.08,            // first 8% of race time
  streakHourMs: 3_600_000,         // 1 hour for Racer!/Pacesetter!
  racerDtCapMs: 90_000,            // single-tick credit cap for Racer!
  stampedeTokens: 7_000,           // tokens-in-a-minute threshold
  stampedeCooldownMs: 7_200_000,   // 2 hours
  pulledAwayGap: 5_000,            // gap-growth threshold per minute
  pulledAwayCooldownMs: 7_200_000, // 2 hours
  recentEventsRetentionMs: 90_000, // sliding window for recent_events
} as const;

export type RecentEvent = {
  at: number;          // ms-since-epoch
  name: AchievementName;
  xp: number;
};
