import type { CollectedHat, HatId, HorseColors, HorseView, MarketSnapshot, Race, RaceStatus, RaceSummary, RaceView, OrganisationSummary, StableHorse, RaceSchedule, League, DivisionConfig, ModelKey, SeasonStandings, RaceSettings } from './types.js';
import type { StaminaConfig } from './scoring.js';

export type CreateRaceRequest = {
  name: string;
  start_time: string;
  end_time: string;
  tz: string;
  max_participants?: number;
  organisation_name?: string;
  counts_input?: boolean;
  primary_top5?: boolean;
  stamina?: boolean;
};

export type CreateRaceResponse = {
  race_id: string;
  join_code: string;
  admin_code: string;
};

export type GetRaceResponse = RaceView;

export type JoinRaceRequest = {
  stable_horse_id: string;
  primary_model?: ModelKey;   // omitted ⇒ server locks 'claude'
};

export type JoinRaceResponse = {
  horse_id: string;
  heartbeat_token: string;
  primary_model: ModelKey;    // the locked value (fresh join or resume)
};

export type HeartbeatRequest = {
  seq: number;
  components?: Record<ModelKey, number>;  // per-source deltas (each ≥ 0)
  delta?: number;                         // legacy single delta (pre-multi-model CLIs)
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

export type GetRaceSeriesResponse = {
  start_ms: number; // race window start (epoch ms)
  end_ms: number;   // race window end (epoch ms)
  horses: Array<{
    horse_id: string;
    points: SeriesPoint[]; // time-ordered; may be empty
  }>;
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
  creator_user_id: string;
  creator_user_name: string;
};

export type OrgMembersResponse = {
  members: { user_id: string; user_name: string; joined_at: string }[];
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

export type OrgSlackMessages = {
  race_created: boolean;
  race_ended: boolean;
  league_season_ended: boolean;
  weekly_digest: boolean;
  release_published: boolean;
};
export type OrgSlackDigest = { weekday: number; time_local: string; tz: string };
export type SetOrgSlackRequest = {
  bot_token?: string;          // omit on update to keep the stored token
  channel_id: string;
  messages: OrgSlackMessages;
  digest?: OrgSlackDigest;
};
export type GetOrgSlackResponse = {
  configured: boolean;
  channel_id: string | null;
  messages: OrgSlackMessages | null;
  digest: OrgSlackDigest | null;
};
export type DeleteOrgSlackResponse = { ok: true };

export type ReleaseComponent = 'cli' | 'site';

export type AnnounceReleaseRequest = {
  component: ReleaseComponent;
  version: string;    // x.y.z
  date: string;       // YYYY-MM-DD
  changes: string[];  // 1-20 non-empty entries
};

export type AnnounceReleaseResponse =
  | { announced: true; orgs_notified: number }
  | { announced: false; reason: 'duplicate' };

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
  primary_top5?: boolean;
  stamina?: boolean;
};
export type SetOrgScheduleResponse = { schedule: RaceSchedule };
export type GetOrgScheduleResponse = { schedule: RaceSchedule | null };
export type DeleteOrgScheduleResponse = { ok: true };

export type SetOrgLeagueRequest = {
  divisions: DivisionConfig[];
  boundaries: number[];
  races_per_season: number;
  weekdays: number[];
  start_local: string;
  end_local: string;
  tz: string;
  race_name?: string;
  max_participants?: number;
  counts_input?: boolean;
  primary_top5?: boolean;
  stamina?: boolean;
};
export type SetOrgLeagueResponse = { league: League };
export type GetOrgLeagueResponse = { league: League | null };
export type DeleteOrgLeagueResponse = { ok: true };

export type GetLeagueStandingsResponse = { standings: SeasonStandings | null };

export type GetOrgRaceSettingsResponse = { settings: RaceSettings | null };
export type SetOrgRaceSettingsRequest = { stamina_config?: StaminaConfig };
export type SetOrgRaceSettingsResponse = { settings: RaceSettings };

export type MarketHorse = {
  horse_id: string;
  name: string;
  colors: HorseColors;
  division?: number;
  scored_tokens: number;
};

// `open: false` before MARKET_OPEN_MIN has elapsed (with a countdown) and
// again once the race has finished (no countdown — it's simply over).
export type GetMarketsResponse =
  | { open: false; opens_in_seconds?: number }
  | { open: true; snapshot: MarketSnapshot; horses: MarketHorse[] };

export type GetMarketHistoryResponse = {
  history: MarketSnapshot[];
};
