import type { CollectedHat, HatId, HorseColors, HorseView, Race, RaceStatus, RaceSummary, RaceView, OrganisationSummary, StableHorse, RaceSchedule } from './types.js';

export type CreateRaceRequest = {
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants?: number;
  organisation_name?: string;
  counts_input?: boolean;
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
  seq: number;
  delta: number;
};

export type HeartbeatResponse = {
  race_status: RaceStatus;
  server_time: string;
  time_left_seconds: number;
  horses: HorseView[];
  race: Race;
  last_seq: number;
};

export type SeriesPoint = {
  t: number; // server epoch ms
  d: number; // applied delta (tokens)
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

export type ListOrgRacesResponse = {
  org_name: string;
  races: RaceSummary[];
};

export type LeaderboardEntry = {
  name: string;          // stable horse name
  owner_name: string;    // owning member's display name
  wins: number;
  podiums: number;
  xp: number;
  races_entered: number;
};

export type GetOrgLeaderboardResponse = {
  org_name: string;
  horses: LeaderboardEntry[];   // all org horses, sorted by xp descending
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

export type SetOrgWebhookRequest = { url: string };
export type SetOrgWebhookResponse = { webhook_url: string; webhook_secret: string };
export type GetOrgWebhookResponse = { webhook_url: string | null };
export type DeleteOrgWebhookResponse = { ok: true };

export type RollHatResponse =
  | { result: 'hat'; collected: CollectedHat; hat_index: number; remaining_rolls: number }
  | { result: 'duplicate'; hat_id: HatId; variant?: number; xp_awarded: number; new_xp: number; remaining_rolls: number }
  | { result: 'no_hat'; xp_awarded: number; new_xp: number; remaining_rolls: number };

export type EquipHatRequest = {
  hat_index: number | null;   // null = unequip
};

export type EquipHatResponse = StableHorse;

export type SetOrgScheduleRequest = {
  weekdays: number[];
  start_local: string;
  end_local: string;
  tz: string;
  race_name?: string;
  max_participants?: number;
  counts_input?: boolean;
};
export type SetOrgScheduleResponse = { schedule: RaceSchedule };
export type GetOrgScheduleResponse = { schedule: RaceSchedule | null };
export type DeleteOrgScheduleResponse = { ok: true };
