import type { RecentEvent } from './midrace.js';
import type { StaminaConfig } from './scoring.js';

export type ModelKey = 'claude' | 'codex' | 'gemini';

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
  primary_model?: ModelKey;   // locked model for this race-horse; absent ⇒ 'claude'
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
  // Scored distance — raw tokens passed through the scoring multiplier chain.
  // Absent on rows written before the feature; read via scoredOf().
  scored_tokens?: number;
  final_scored_tokens?: number;
  stamina?: number;
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
  // When true, only each racer's 5 most-active conversations per heartbeat
  // count toward their PRIMARY model's score (secondaries unaffected). Absent
  // ⇒ off: every conversation counts. Locked at race creation.
  primary_top5?: boolean;
  // League fixture tags — present only on races materialised for a league.
  // `league_id` is the org id (one league per org); `league_season`/`league_round`
  // locate the fixture within its season for scoring and the "round X/N" display.
  league_id?: string;
  league_season?: number;
  league_round?: number;
  // League fixtures only: the league's division names, index 0 = division 1
  // (top flight). Lets clients label the division-grouped order without a
  // separate config fetch. Absent for non-league races.
  league_division_names?: string[];
  // Stamina: a horse above a sustainable pace tires and scores less until it
  // recovers. Locked at race creation.
  stamina?: boolean;
  // Per-org stamina tuning, snapshotted at race creation.
  stamina_config?: StaminaConfig;
};

export type HorseView = Horse & {
  rank: number;
  // Trailing 15-minute token pace (tokens/min), computed server-side from the
  // series points. Present only for live races; absent for pending/finished.
  pace_15m?: number;
  // League fixtures only: the horse's division for the current season (bottom
  // division = league.divisions.length for an unscored new entrant). Absent
  // for non-league races.
  division?: number;
};

export type RaceHighlight = {
  horse_name: string;
  tokens: number;     // finished: final_scored_tokens (fallback scored/current tokens); live: scored/current tokens
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
  // Set once a Google account is linked. Absent on every pre-SSO row.
  email?: string;
  email_verified?: boolean;
  idp?: 'google';
  idp_sub?: string;
  hd?: string;            // Google hosted-domain claim; Workspace accounts only
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
      // false = obtainable only via a claim token, never from a roll.
      rollable: boolean;
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
      rollable: boolean;
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
  total_tokens?: number;             // sum of final_scored_tokens across all races
  total_finishing_position?: number; // sum of ranks; avg = sum / races_entered
  hats?: CollectedHat[];
  equipped_hat?: number | null;   // number = equipped index into hats[]; null = explicitly unequipped; undefined = pre-feature stable horses
  last_rolled_level?: number;         // high-water mark for pending rolls
};

// Per-org tuning for the scoring mechanics. Its own row rather than living on
// SCHEDULE or LEAGUE, because it applies to both and is exclusive with neither.
export type RaceSettings = {
  org_id: string;
  stamina_config?: StaminaConfig;
  updated_at: string;
  updated_by_user_id: string;
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
  primary_top5?: boolean;    // stamped onto each scheduled race (see Race.primary_top5)
  stamina?: boolean;         // stamped onto each scheduled race (see Race.stamina)
  created_at: string;
  creator_user_id: string;   // stamped onto each scheduled race
  creator_user_name: string; // stamped onto each scheduled race
  last_materialised_date?: string; // local YYYY-MM-DD of the last race created (idempotency)
};

export type LeagueStatus = 'active' | 'complete';

// One division's config within a league. `cap` is the division's size; the
// LAST division in the list is the uncapped overflow (its cap is ignored).
export type DivisionConfig = { name: string; cap: number };

// Shape-only config edits staged during an active season and applied at the next
// rollover (see set-org-league). Live fields (schedule/name/options) apply immediately.
export type PendingStructural = {
  divisions?: DivisionConfig[];
  boundaries?: number[];
  races_per_season?: number;
};

// One league config per org. Stored on the org's LEAGUE row. Mutually
// exclusive with RaceSchedule. The bottom (overflow) division ignores its
// `cap` (it holds everyone above the caps of the divisions before it).
export type League = {
  org_id: string;
  divisions: DivisionConfig[];    // ordered top → bottom; last = uncapped overflow
  boundaries: number[];           // length divisions.length-1; swap[i] between div i and i+1
  races_per_season: number;       // fixtures per season (>= 1)
  weekdays: number[];             // ISO weekdays, 1=Mon..7=Sun
  start_local: string;            // "HH:MM" 24h, local to tz
  end_local: string;              // "HH:MM" 24h, local to tz
  tz: string;                     // IANA
  race_name?: string;
  max_participants?: number;
  counts_input?: boolean;
  primary_top5?: boolean;
  stamina?: boolean;         // stamped onto each fixture (see Race.stamina)
  current_season: number;         // 1-based; the season fixtures accrue into
  status: LeagueStatus;           // 'complete' is transient during rollover
  pending_structural?: PendingStructural; // shape edits staged mid-season, applied at rollover
  created_at: string;
  creator_user_id: string;
  creator_user_name: string;
};

// Per-season state for a league. Stored on the LEAGUE#SEASON#<n> row. Tracks how
// many fixtures have materialised this season (also the last round number) and the
// local date of the most recent fixture (per-day idempotency).
export type LeagueSeason = {
  org_id: string;
  season: number;
  status: 'active' | 'complete';
  fixtures_materialised: number;
  last_materialised_date?: string; // local YYYY-MM-DD
  final_fixture_end?: string; // ISO end_time of the final fixture; set at final-round materialisation
  created_at: string;
};

// One horse's standing within a division for a season. Stored on
// LEAGUE#SEASON#<n>#DIV#<d>#HORSE#<stable_horse_id>. Per-round scoring
// idempotency is guarded by a `scored_rounds` number-set on the stored item —
// an internal detail stripped before this shape is returned.
export type LeagueStanding = {
  org_id: string;
  season: number;
  division: number;         // 1 = top flight, league.divisions = bottom/overflow
  stable_horse_id: string;
  horse_name: string;
  user_id: string;
  user_name: string;
  points: number;
  season_tokens: number;    // sum of final_tokens across the season's fixtures
  entered_at: string;
  prize_awarded?: boolean;  // set once at rollover before minting season prize XP (idempotency mark)
};

// Compact, history-safe record of a finished season. Full tables remain queryable
// from the retained LEAGUE#SEASON#<n>#DIV#... rows; this snapshots the champion and
// the season's division names so a later rename can't rewrite history.
export type LeagueSeasonResult = {
  org_id: string;
  season: number;
  champion: { stable_horse_id: string; horse_name: string; user_name: string; points: number } | null;
  division_champions: Array<{ division: number; name: string; stable_horse_id: string; horse_name: string }>;
  promoted: string[];   // stable_horse_ids that moved up
  relegated: string[];  // stable_horse_ids that moved down
  division_names: string[]; // snapshot; index 0 = division 1
  finished_at: string;
};

export type StandingRow = {
  rank: number;              // 1-based within the division
  stable_horse_id: string;
  horse_name: string;
  user_name: string;
  points: number;
  season_tokens: number;
  zone: 'promote' | 'relegate' | null;
};
export type DivisionStandings = { division: number; name: string; rows: StandingRow[] };
export type SeasonStandings = {
  org_name: string;
  season: number;
  round: number;             // fixtures materialised so far this season
  races_per_season: number;
  divisions: DivisionStandings[]; // ordered 1..N (top flight first)
};
