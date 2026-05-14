import type { HorseColors, RaceStatus, RaceView } from './types.js';

export type CreateRaceRequest = {
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants?: number;
};

export type CreateRaceResponse = {
  race_id: string;
  join_code: string;
  admin_code: string;
};

export type GetRaceResponse = RaceView;

export type JoinRaceRequest = {
  horse: {
    stable_horse_id: string;
    name: string;
    colors: HorseColors;
  };
};

export type JoinRaceResponse = {
  horse_id: string;
  heartbeat_token: string;
};

export type HeartbeatRequest = {
  current_tokens: number;
};

export type HeartbeatResponse = {
  race_status: RaceStatus;
  server_time: string;
  time_left_seconds: number;
};

export type EndRaceResponse = {
  ok: true;
};
