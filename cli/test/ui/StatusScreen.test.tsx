import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusScreen } from '../../src/ui/StatusScreen.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

function horse(id: string, name: string, rank: number, tokens: number, division?: number): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name, colors: COLORS,
    current_tokens: tokens, last_heartbeat: '', joined_at: '', rank,
    user_name: `${name}Owner`, xp: 0,
    ...(division === undefined ? {} : { division }),
  } as unknown as HorseView;
}

// Server returns horses already rank-sorted, so fixtures mirror that.
function race(over: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    name: 'Test Race', status: 'live', time_left_seconds: 600,
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 600_000).toISOString(),
    server_time: new Date().toISOString(),
    horses: [horse('a', 'Alpha', 1, 900), horse('b', 'Beta', 2, 500)],
    ...over,
  } as unknown as GetRaceResponse;
}

function screen(r: GetRaceResponse, ownHorseId = 'b') {
  const { lastFrame } = render(
    <StatusScreen
      race={r}
      ownHorseId={ownHorseId}
      ownHorseName="Beta"
      ownColors={COLORS}
      ownUserName="BetaOwner"
      lastHeartbeatAgoSec={12}
      lastHeartbeatOk
    />,
  );
  return lastFrame() ?? '';
}

// A league fixture: two divisions, Beta second overall but top of division 2.
function leagueRace(): GetRaceResponse {
  return race({
    league_division_names: ['Premier', 'Championship'],
    horses: [
      horse('a', 'Alpha', 1, 900, 1),
      horse('b', 'Beta', 2, 500, 2),
      horse('c', 'Gamma', 3, 400, 1),
      horse('d', 'Delta', 4, 100, 2),
    ],
  } as Partial<GetRaceResponse>);
}

describe('StatusScreen division lines', () => {
  it('omits both division lines on a non-league race', () => {
    const frame = screen(race());
    expect(frame).not.toContain('(Division)');
  });

  it('shows position within the division, not the overall field', () => {
    const frame = screen(leagueRace());
    // Beta is 2nd of 4 overall, but 1st of the 2 horses in division 2.
    expect(frame).toContain('Position:');
    expect(frame).toMatch(/Position \(Division\):\s+1 of 2/);
    expect(frame).toMatch(/Position:\s+2 of 4/);
  });

  it('shows the division leader, who can differ from the overall leader', () => {
    const frame = screen(leagueRace(), 'd'); // Delta: division 2, last overall
    expect(frame).toMatch(/Leader:\s+Alpha \(AlphaOwner\) — 900/);
    expect(frame).toMatch(/Leader \(Division\):\s+Beta \(BetaOwner\) — 500/);
  });

  it('names you as division leader when you lead your own division', () => {
    const frame = screen(leagueRace(), 'b'); // Beta tops division 2
    expect(frame).toMatch(/Leader \(Division\):\s+Beta \(BetaOwner\) — 500/);
  });

  it('hides the division lines when the league race has no division on your horse', () => {
    const r = race({
      league_division_names: ['Premier'],
      horses: [horse('a', 'Alpha', 1, 900), horse('b', 'Beta', 2, 500)],
    } as Partial<GetRaceResponse>);
    expect(screen(r)).not.toContain('(Division)');
  });

  it('keeps the value column tight on a non-league race and widens it for a league one', () => {
    const plain = screen(race());
    const league = screen(leagueRace());
    // 'Last heartbeat:' sets the column: 1 space on a plain race, 6 once
    // 'Position (Division):' (4 chars longer) joins the panel.
    expect(plain).toMatch(/Last heartbeat: {1}12s ago/);
    expect(league).toMatch(/Last heartbeat: {6}12s ago/);
  });
});
