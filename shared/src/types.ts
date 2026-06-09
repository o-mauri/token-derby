import type { RecentEvent } from './midrace.js';

export type HorseColors = {
  body: string;
  mane: string;
  tail: string;
  saddle: string;
};

export type Horse = {
  horse_id: string;
  stable_horse_id: string;
  name: string;
  colors: HorseColors;
  current_tokens: number;
  last_heartbeat: string;
  joined_at: string;
  final_tokens?: number;
  user_id: string;
  user_name: string;
  xp: number;
  xp_awarded?: number;
  last_seq?: number;          // highest applied heartbeat sequence (delta protocol)
  // Mid-race XP state — all optional for backwards compat with existing race-horse rows.
  live_xp?: number;
  last_rank?: number;
  racer_streak_ms?: number;
  racer_awards?: number;
  pacesetter_streak_ms?: number;
  pacesetter_awards?: number;
  overtake_awards?: number;
  lead_take_awards?: number;
  last_stampede_at?: number;
  was_in_last?: boolean;
  comeback_awarded?: boolean;
  last_gap_in_1st?: number;
  last_pulled_away_at?: number;
  recent_events?: RecentEvent[];
  equipped_hat?: CollectedHat;        // snapshot from stable horse at join time
};

export type RaceStatus = 'pending' | 'live' | 'finished';

export type Race = {
  race_id: string;
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants: number;
  join_code: string;
  created_at: string;
  ended_at?: string;
  cli_version?: string;
  creator_user_id?: string;
  creator_user_name?: string;
  org_id?: string;
  organisation_name?: string;
  // When true, races count input+output tokens (incl. cache reads/creations)
  // instead of just output. Server-side achievement and rate-cap thresholds
  // scale by TOKEN_INPUT_MULTIPLIER for these races.
  counts_input?: boolean;
};

export type HorseView = Horse & {
  rank: number;
};

export type RaceHighlight = {
  horse_name: string;
  tokens: number;     // finished: final_tokens (fallback current_tokens); live: current_tokens
  colors: HorseColors;
  hat?: CollectedHat; // equipped hat so the mini sprite matches the race page
};

export type RaceSummary = {
  race_id: string;
  name: string;
  join_code: string;
  start_time: string;
  end_time: string;
  status: RaceStatus;
  ended_at?: string;
  // Winner (finished) or current leader (live). Absent for pending races,
  // races with zero horses, or when the horse lookup fails.
  highlight?: RaceHighlight;
  // Live races only, computed server-side at request time.
  time_left_seconds?: number;
};

export type RaceView = Race & {
  status: RaceStatus;
  horses: HorseView[];
  server_time: string;
  time_left_seconds: number;
};

export type Organisation = {
  org_id: string;
  org_name: string;
  created_at: string;
  creator_user_id: string;
  creator_user_name: string;
};

export type OrganisationMember = {
  org_id: string;
  user_id: string;
  user_name: string;
  joined_at: string;
};

export type OrganisationSummary = {
  org_id: string;
  org_name: string;
};

export type User = {
  user_id: string;
  display_name: string;
  created_at: string;
};

export type HatRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type HatId = string;

export type HatVariant = { A: string; Q?: string };

export type HatAnimation = { type: 'cycle'; frames: string[]; fps: number };

export type Hat =
  | {
      id: HatId;
      name: string;
      rarity: 'common' | 'rare' | 'epic';
      width: number;
      anchor_x: number;
      rows: string[];
      variants: HatVariant[];
    }
  | {
      id: HatId;
      name: string;
      rarity: 'legendary';
      width: number;
      anchor_x: number;
      rows: string[];
      colors: HatVariant;
      animation: HatAnimation;
    };

export type CollectedHat = {
  id: HatId;
  variant?: number;       // index into hat.variants[]; omitted for legendary
  obtained_at: string;    // ISO timestamp
};

export type StableHorse = {
  stable_horse_id: string;
  name: string;
  colors: HorseColors;
  created_at: string;
  xp: number;
  // Lifetime race stats. All optional for backwards compat — pre-existing
  // stable horses without these fields read as 0.
  races_entered?: number;
  wins?: number;                     // count of rank-1 finishes
  podiums?: number;                  // count of rank ≤ 3 finishes
  total_tokens?: number;             // sum of final_tokens across all races
  total_finishing_position?: number; // sum of ranks; avg = sum / races_entered
  hats?: CollectedHat[];
  equipped_hat?: number | null;   // number = equipped index into hats[]; null = explicitly unequipped; undefined = pre-feature stable horses
  last_rolled_level?: number;         // high-water mark for pending rolls
};

// One repeating race schedule per org. Stored on the org's SCHEDULE row.
export type RaceSchedule = {
  org_id: string;
  weekdays: number[];        // ISO weekdays, 1=Mon .. 7=Sun
  start_local: string;       // "HH:MM" 24h, local to `tz`
  end_local: string;         // "HH:MM" 24h, local to `tz`
  tz: string;                // IANA, e.g. "Europe/London"
  race_name?: string;        // optional name for created races
  max_participants?: number;
  counts_input?: boolean;
  created_at: string;
  creator_user_id: string;   // stamped onto each scheduled race
  creator_user_name: string; // stamped onto each scheduled race
  last_materialised_date?: string; // local YYYY-MM-DD of the last race created (idempotency)
};
