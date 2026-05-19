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
};

export type HorseView = Horse & {
  rank: number;
};

export type RaceSummary = {
  race_id: string;
  name: string;
  join_code: string;
  start_time: string;
  end_time: string;
  status: RaceStatus;
  ended_at?: string;
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

export type StableHorse = {
  stable_horse_id: string;
  name: string;
  colors: HorseColors;
  created_at: string;
  xp: number;
};
