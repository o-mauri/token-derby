import { describe, it, expect, beforeEach } from 'vitest';
import { renderTickerItem, collectFreshItems } from '../src/render/ticker.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

beforeEach(() => {
  document.body.innerHTML = '<div id="container"></div>';
});

function horse(over: Partial<HorseView>): HorseView {
  return {
    horse_id: over.horse_id ?? 'h1',
    stable_horse_id: 'stable',
    name: over.name ?? 'Stormbringer',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: 0,
    last_heartbeat: new Date(0).toISOString(),
    joined_at: new Date(0).toISOString(),
    rank: 1,
    user_id: 'u1',
    user_name: 'Alice',
    xp: 0,
    recent_events: over.recent_events,
  } as HorseView;
}

function race(horses: HorseView[]): GetRaceResponse {
  return {
    race_id: 'r',
    name: 'Test',
    start_time: new Date(0).toISOString(),
    end_time: new Date(0).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: 'ABCDEF',
    created_at: new Date(0).toISOString(),
    status: 'live',
    server_time: new Date(0).toISOString(),
    time_left_seconds: 100,
    horses,
  } as GetRaceResponse;
}

describe('renderTickerItem', () => {
  it('builds a one-line node with horse name, achievement, description, and XP', () => {
    const node = renderTickerItem(document, {
      horseName: 'Thundercloud',
      name: 'Overtake!',
      description: 'Overtook another horse',
      xp: 3,
    });
    expect(node.classList.contains('achievement-ticker-item')).toBe(true);
    expect(node.textContent).toContain('Thundercloud');
    expect(node.textContent).toContain('Overtake!');
    expect(node.textContent).toContain('Overtook another horse');
    expect(node.textContent).toContain('+3 XP');
  });
});

describe('collectFreshItems', () => {
  it('returns items for events newer than the watermark and advances it', () => {
    const shownAt = new Map<string, number>();
    const r = race([
      horse({ horse_id: 'h1', name: 'Stormbringer', recent_events: [
        { at: 10, name: 'Took the lead!', xp: 5 },
        { at: 20, name: 'Overtake!', xp: 3 },
      ] }),
    ]);

    const first = collectFreshItems(r, shownAt);
    expect(first.map((i) => i.name)).toEqual(['Took the lead!', 'Overtake!']);
    expect(first[0]!.horseName).toBe('Stormbringer');
    expect(shownAt.get('h1')).toBe(20);

    // Same snapshot again → nothing fresh.
    expect(collectFreshItems(r, shownAt)).toEqual([]);
  });

  it('only surfaces events past the existing watermark on later ticks', () => {
    const shownAt = new Map<string, number>([['h1', 20]]);
    const r = race([
      horse({ horse_id: 'h1', recent_events: [
        { at: 20, name: 'Overtake!', xp: 3 },
        { at: 30, name: 'Stampede!', xp: 2 },
      ] }),
    ]);
    const items = collectFreshItems(r, shownAt);
    expect(items.map((i) => i.name)).toEqual(['Stampede!']);
    expect(shownAt.get('h1')).toBe(30);
  });

  it('describes multi-position overtakes using the climb count', () => {
    const shownAt = new Map<string, number>();
    const r = race([
      horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Overtake!', xp: 9 }] }),
    ]);
    const items = collectFreshItems(r, shownAt);
    expect(items[0]!.description).toBe('Overtook 3 horses');
  });

  it('scales token thresholds by the input multiplier when the race counts input', () => {
    const shownAt = new Map<string, number>();
    const r = {
      ...race([horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Stampede!', xp: 2 }] })]),
      counts_input: true,
    } as GetRaceResponse;
    const items = collectFreshItems(r, shownAt);
    // 7,000 base × 10 = 70,000 (matches the CLI), not the base 7,000.
    expect(items[0]!.description).toContain('70,000');
  });

  it('uses the base threshold when the race does not count input', () => {
    const shownAt = new Map<string, number>();
    const r = race([horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Stampede!', xp: 2 }] })]);
    const items = collectFreshItems(r, shownAt);
    expect(items[0]!.description).toContain('7,000');
  });

  it('returns an empty array when no horse has fresh events', () => {
    const shownAt = new Map<string, number>();
    const r = race([horse({ horse_id: 'h1', recent_events: [] }), horse({ horse_id: 'h2' })]);
    expect(collectFreshItems(r, shownAt)).toEqual([]);
  });
});
