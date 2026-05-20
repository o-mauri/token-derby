import type { HorseColors } from './types.js';

export type WebhookEventType = 'race.created' | 'race.ended';

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
}>;
