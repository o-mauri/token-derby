import type { HorseColors, SeasonStandings } from './types.js';

export type WebhookEventType = 'race.created' | 'race.ended' | 'league.season.ended';

export type WebhookEnvelope<TBody> = {
  event: WebhookEventType;
  delivery_id: string;
  sent_at: string;
  organisation: { org_id: string; org_name: string };
} & TBody;

export type RaceCreatedEvent = WebhookEnvelope<{
  event: 'race.created';
  race: {
    race_id: string;
    name: string;
    join_code: string;
    start_time: string;
    end_time: string;
    tz: string;
    max_participants: number;
    created_at: string;
    creator_user_id: string;
    creator_user_name: string;
  };
}>;

export type RaceEndedResult = {
  rank: number;
  horse_id: string;
  stable_horse_id: string;
  name: string;
  colors: HorseColors;
  final_tokens: number;
  xp_awarded: number;
  user_id: string;
  user_name: string;
};

// One finisher's placing within its division for the race just run.
export type LeagueRaceOrderRow = {
  position: number;          // 1-based within the division for THIS fixture
  stable_horse_id: string;
  horse_name: string;
  user_name: string;
  final_tokens: number;
  points_awarded: number;    // fixed-table league points earned this fixture
};

export type RaceEndedEvent = WebhookEnvelope<{
  event: 'race.ended';
  race: {
    race_id: string;
    name: string;
    join_code: string;
    start_time: string;
    end_time: string;
    tz: string;
    created_at: string;
    ended_at: string;
  };
  results: RaceEndedResult[];
  // Present only for League fixtures: this race's finish split by division, plus
  // the season standings after this race.
  league?: {
    season: number;
    round: number;
    races_per_season: number;
    race_order: Array<{ division: number; name: string; order: LeagueRaceOrderRow[] }>;
    standings: SeasonStandings;
  };
}>;

// A horse that changed division at rollover.
export type LeagueMoveRow = {
  stable_horse_id: string;
  horse_name: string;
  user_name: string;
  from_division: number;
  to_division: number;
};

export type LeagueSeasonEndedEvent = WebhookEnvelope<{
  event: 'league.season.ended';
  league: {
    season: number;         // the season that just ended
    next_season: number;
    races_per_season: number;
    champion: { stable_horse_id: string; horse_name: string; user_name: string; points: number } | null;
    standings: SeasonStandings;   // final standings of the ended season
    promoted: LeagueMoveRow[];
    relegated: LeagueMoveRow[];
  };
}>;
