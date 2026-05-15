import type { HorseColors, RaceStatus, RaceView, OrganisationSummary, StableHorse } from './types.js';

export type CreateRaceRequest = {
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants?: number;
  organisation_name?: string;
};

export type CreateRaceResponse = {
  race_id: string;
  join_code: string;
  admin_code: string;
};

export type GetRaceResponse = RaceView;

export type JoinRaceRequest = {
  stable_horse_id: string;
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

export type CreateOrganisationRequest = {
  name: string;
};

export type CreateOrganisationResponse = {
  org_id: string;
  org_name: string;
  org_join_token: string;
};

export type JoinOrganisationRequest = {
  join_token: string;
};

export type JoinOrganisationResponse = {
  org_id: string;
  org_name: string;
};

export type ListOrganisationsResponse = {
  organisations: OrganisationSummary[];
};

export type GetOrganisationResponse = {
  org_id: string;
  org_name: string;
  org_join_token: string;
  created_at: string;
  creator_user_name: string;
};

export type InitJockeyRequest = {
  display_name: string;
};

export type InitJockeyResponse = {
  user_id: string;
  display_name: string;
  secret_token: string;
};

export type GetJockeyResponse = {
  user_id: string;
  display_name: string;
  created_at: string;
};

export type UpdateJockeyRequest = {
  display_name: string;
};

export type UpdateJockeyResponse = {
  user_id: string;
  display_name: string;
};

export type ListStableResponse = {
  horses: StableHorse[];
};

export type CreateStableHorseRequest = {
  name: string;
  colors: HorseColors;
};

export type CreateStableHorseResponse = StableHorse;

export type UpdateStableHorseRequest = {
  name?: string;
  colors?: HorseColors;
};

export type UpdateStableHorseResponse = StableHorse;

export type DeleteStableHorseResponse = {
  ok: true;
};
