import { describe, it, expect, beforeEach } from 'vitest';
import { renderFinishedOverlay } from '../src/render/finished.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

function race(horses: HorseView[]): GetRaceResponse {
  return {
    race_id: 'r1', name: 'X',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC', max_participants: 30, join_code: 'JC1234',
    created_at: 'c',
    status: 'finished',
    horses,
    server_time: '2026-04-22T17:00:00Z',
    time_left_seconds: 0,
    ended_at: '2026-04-22T17:00:00Z',
  };
}

function horse(
  id: string,
  rank: number,
  name: string,
  tokens: number,
  xp: number,
  xp_awarded?: number,
  extras: Partial<HorseView> = {},
): HorseView {
  return {
    horse_id: id,
    stable_horse_id: `sh-${id}`,
    name,
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: tokens,
    last_heartbeat: '2026-04-22T16:59:00Z',
    joined_at: '2026-04-22T09:00:00Z',
    final_tokens: tokens,
    rank,
    user_id: `user-${id}`,
    user_name: `User ${id.toUpperCase()}`,
    xp,
    ...(xp_awarded !== undefined ? { xp_awarded } : {}),
    ...extras,
  };
}

let track: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  track = document.createElement('div');
  track.className = 'race';
  document.body.appendChild(track);
});

describe('renderFinishedOverlay', () => {
  it('renders 1st/2nd/3rd in <ol> with podium cards', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, 80),
      horse('b', 2, 'Bravo', 800, 0, 65),
      horse('c', 3, 'Charlie', 500, 0, 50),
    ]));
    const items = track.querySelectorAll('.podium ol li');
    expect(items.length).toBe(3);
    expect(items[0]!.querySelector('.name')?.textContent).toBe('Alpha');
    expect(items[1]!.querySelector('.name')?.textContent).toBe('Bravo');
    expect(items[2]!.querySelector('.name')?.textContent).toBe('Charlie');
  });

  it('shows total XP gained for each podium horse', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, 80),
      horse('b', 2, 'Bravo', 800, 0, 65),
      horse('c', 3, 'Charlie', 500, 0, 50),
    ]));
    const gained = Array.from(track.querySelectorAll('.podium .xp-gained')).map(el => el.textContent);
    expect(gained).toEqual(['+80 XP', '+65 XP', '+50 XP']);
  });

  it('shows LEVEL UP banner when xp_awarded crosses a threshold', () => {
    // Alpha starts at 40 XP (level 1), gains 80 → 120 XP (level 2). Should level up.
    // Bravo starts at 0 XP (level 1), gains 25 → 25 XP (still level 1). No level up.
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 40, 80),
      horse('b', 2, 'Bravo', 800, 0, 25),
    ]));
    const cards = track.querySelectorAll('.podium ol li');
    expect(cards[0]!.querySelector('.level-up-banner')?.textContent).toBe('LEVEL UP!');
    expect(cards[1]!.querySelector('.level-up-banner')).toBeNull();
  });

  it('initial xp bar width starts at old progress for same-level horses', () => {
    // 25 XP into level 1 (50 needed) = 50% progress before; +25 → 50 XP, just hits level 2.
    // Actually 50 XP = level 2 start, level-up. So use a smaller award that stays in level 1.
    // 10 XP → 20 XP, still level 1; before progress=10/50=20%, after=20/50=40%.
    renderFinishedOverlay(track, race([
      horse('a', 1, 'SoloRacer', 200, 10, 10),
    ]));
    const fill = track.querySelector<HTMLElement>('.xp-bar-fill')!;
    // Initial width comes from before.progress (10/50 = 20%) since same level.
    expect(fill.style.width).toBe('20.00%');
    // Target stored in dataset is 40% (20/50).
    expect(fill.dataset.targetPct).toBe('40.00');
  });

  it('initial xp bar width starts at 0 when the horse levelled up (new level)', () => {
    // 40 XP (level 1, 40/50) → +80 → 120 XP (level 2, 70/128)
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 40, 80),
    ]));
    const fill = track.querySelector<HTMLElement>('.xp-bar-fill')!;
    // Levelled up → start at 0% of new level.
    expect(fill.style.width).toBe('0.00%');
    // Target: 70/128 ≈ 54.69%
    expect(parseFloat(fill.dataset.targetPct ?? '0')).toBeCloseTo(54.69, 1);
  });

  it('shows the level chip with the post-race level', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 40, 80), // 120 xp → Lvl 2
    ]));
    expect(track.querySelector('.podium .level-chip')?.textContent).toBe('Lvl. 2');
  });

  it('renders a standings table for ranks 4+', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha',  1000, 0,  80),
      horse('b', 2, 'Bravo',   800, 0,  65),
      horse('c', 3, 'Charlie', 500, 0,  50),
      horse('d', 4, 'Delta',   200, 0,  25),
      horse('e', 5, 'Echo',     50, 40, 25), // 65 xp → Lvl 2 (crossed 50)
    ]));
    const rows = track.querySelectorAll('.standings-table tbody tr');
    expect(rows.length).toBe(2);
    // Rank
    expect(rows[0]!.querySelector('.rank')?.textContent).toBe('4');
    // Horse name cell contains both the name (as text node) and the jockey span.
    const deltaHorseCell = rows[0]!.querySelector('.horse-name')!;
    expect(deltaHorseCell.firstChild?.textContent).toBe('Delta');
    expect(deltaHorseCell.querySelector('.jockey')?.textContent).toBe(' (User D)');
    // Echo levels up.
    const echoHorseCell = rows[1]!.querySelector('.horse-name')!;
    expect(echoHorseCell.firstChild?.textContent).toBe('Echo');
    expect(echoHorseCell.querySelector('.jockey')?.textContent).toBe(' (User E)');
    expect(rows[1]!.querySelector('.levelled-up')?.textContent).toBe('Lvl. 1 → 2');
  });

  it('omits the jockey span when user_name is missing', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, 80),
      horse('b', 2, 'Bravo', 800,  0, 65),
      horse('c', 3, 'Charlie', 500, 0, 50),
      horse('d', 4, 'Delta', 200,  0, 25, { user_name: '' as any }),
    ]));
    const tableRow = track.querySelector('.standings-table tbody tr')!;
    expect(tableRow.querySelector('.horse-name')?.textContent).toBe('Delta');
    expect(tableRow.querySelector('.horse-name .jockey')).toBeNull();
  });

  it('omits the standings table when only 3 or fewer horses raced', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, 80),
      horse('b', 2, 'Bravo', 800, 0, 65),
    ]));
    expect(track.querySelector('.standings-table')).toBeNull();
  });

  it('is idempotent — second call does not re-render', () => {
    const horses = [horse('a', 1, 'Alpha', 1000, 0, 80)];
    renderFinishedOverlay(track, race(horses));
    renderFinishedOverlay(track, race(horses));
    expect(track.querySelectorAll('.podium').length).toBe(1);
  });

  it('handles missing xp_awarded by showing 0 XP gained (no chip text "+0")', () => {
    // If the race ended pre-XP-awarding (legacy), xp_awarded is undefined.
    // We should still render without crashing.
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, undefined),
    ]));
    expect(track.querySelector('.podium')).not.toBeNull();
    // No xp-gained span rendered when award is 0/undefined.
    expect(track.querySelector('.xp-gained')).toBeNull();
  });

  it('shows xp from achievements alongside total xp awarded', () => {
    renderFinishedOverlay(track, race([
      horse('a', 1, 'Alpha', 1000, 0, 50, { live_xp: 12 }),
      horse('d', 4, 'Delta', 200, 0, 25, { live_xp: 8 }),
    ]));
    expect(track.textContent).toContain('+12 from achievements');
    expect(track.textContent).toContain('+8 from achievements');
  });
});
