import { describe, it, expect } from 'vitest';
import { buildLeagueSeasonEndedMessage } from '../../../src/lib/slack/messages.js';
import type { LeagueSeasonEndedEvent } from '@token-derby/shared';

function event(champion: boolean): LeagueSeasonEndedEvent {
  return {
    event: 'league.season.ended', delivery_id: 'd', sent_at: '2026-05-20T17:30:00.000Z',
    organisation: { org_id: 'o1', org_name: 'TeamFoo' },
    league: {
      season: 2, next_season: 3, races_per_season: 6,
      champion: champion ? { stable_horse_id: 's1', horse_name: 'Bolt', user_name: 'Al', points: 88 } : null,
      standings: { org_name: 'TeamFoo', season: 2, round: 6, races_per_season: 6, divisions: [] } as any,
      promoted: [{ stable_horse_id: 's2', horse_name: 'Dash', user_name: 'Bo', from_division: 2, to_division: 1 }],
      relegated: [{ stable_horse_id: 's3', horse_name: 'Nag', user_name: 'Cy', from_division: 1, to_division: 2 }],
    },
  };
}

describe('buildLeagueSeasonEndedMessage', () => {
  it('names the champion, promotions and relegations', () => {
    const m = buildLeagueSeasonEndedMessage(event(true));
    expect(m.text).toContain('Season 2');
    const joined = m.blocks.map((b: any) => b.text?.text ?? '').join('\n');
    expect(joined).toContain('Bolt');
    expect(joined).toContain('Dash');   // promoted
    expect(joined).toContain('Nag');    // relegated
  });

  it('handles no champion', () => {
    const m = buildLeagueSeasonEndedMessage(event(false));
    const joined = m.blocks.map((b: any) => b.text?.text ?? '').join('\n');
    expect(joined.toLowerCase()).toContain('no champion');
  });
});
