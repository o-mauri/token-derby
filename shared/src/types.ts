export type HorseColors = {
  body: string;
  mane: string;
  tail: string;
  saddle: string;
};

export type Horse = {
  horse_id: string;
  name: string;
  colors: HorseColors;
  current_tokens: number;
  last_heartbeat: string;
  joined_at: string;
  final_tokens?: number;
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
};

export type HorseView = Horse & {
  rank: number;
  crashed: boolean;
};

export type RaceView = Race & {
  status: RaceStatus;
  horses: HorseView[];
  server_time: string;
  time_left_seconds: number;
};
