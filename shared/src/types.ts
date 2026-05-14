export type HorseColors = {
  body: string;
  mane: string;
  tail: string;
  saddle: string;
};

export type HatRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type HatId = string;
export type HatColors = { A: string; Q?: string };

export type Hat = {
  id: HatId;
  name: string;
  rarity: HatRarity;
  rows: readonly string[];
  width: number;
  anchor_x: number;
  colors: HatColors;
  animation?: {
    type: 'cycle';
    frames: readonly string[];
    fps: number;
  };
};

export type CollectedHat = {
  id: HatId;
  tint?: string;
  obtained_at: string;
};

export type Horse = {
  horse_id: string;
  name: string;
  colors: HorseColors;
  current_tokens: number;
  last_heartbeat: string;
  joined_at: string;
  final_tokens?: number;
  loot_tokens?: number;
  user_id: string;
  user_name: string;
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
};

export type HorseView = Horse & {
  rank: number;
};

export type RaceView = Race & {
  status: RaceStatus;
  horses: HorseView[];
  server_time: string;
  time_left_seconds: number;
};
