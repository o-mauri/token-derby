import { describe, it, expect } from 'vitest';
import { rankHorses } from '../../src/lib/rank-horses.js';
import type { Horse } from '@token-derby/shared';

const horse = (over: Partial<Horse>): Horse => ({
  horse_id: 'h', stable_horse_id: 's', name: 'n',
  colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
  current_tokens: 0, last_heartbeat: '2026-08-04T00:00:00.000Z',
  joined_at: '2026-08-04T00:00:00.000Z', user_id: 'u', user_name: 'U', xp: 0,
  ...over,
});

describe('rankHorses', () => {
  it('ranks by scored distance, not raw tokens', () => {
    const ranked = rankHorses([
      horse({ horse_id: 'raw-leader', current_tokens: 10_000, scored_tokens: 5_000 }),
      horse({ horse_id: 'scored-leader', current_tokens: 8_000, scored_tokens: 8_000 }),
    ]);
    expect(ranked[0]!.horse_id).toBe('scored-leader');
    expect(ranked[1]!.horse_id).toBe('raw-leader');
  });

  it('falls back to current_tokens for pre-feature rows', () => {
    const ranked = rankHorses([
      horse({ horse_id: 'a', current_tokens: 100 }),
      horse({ horse_id: 'b', current_tokens: 200 }),
    ]);
    expect(ranked.map(h => h.horse_id)).toEqual(['b', 'a']);
  });

  it('breaks ties on earlier join time', () => {
    const ranked = rankHorses([
      horse({ horse_id: 'late', current_tokens: 100, joined_at: '2026-08-04T02:00:00.000Z' }),
      horse({ horse_id: 'early', current_tokens: 100, joined_at: '2026-08-04T01:00:00.000Z' }),
    ]);
    expect(ranked[0]!.horse_id).toBe('early');
  });
});
