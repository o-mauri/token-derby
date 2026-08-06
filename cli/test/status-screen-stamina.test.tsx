import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusScreen } from '../src/ui/StatusScreen.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

function horse(over: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'b', stable_horse_id: 's-b', name: 'Beta', colors: COLORS,
    current_tokens: 500, last_heartbeat: '', joined_at: '', rank: 1,
    user_name: 'BetaOwner', xp: 0,
    ...over,
  } as unknown as HorseView;
}

function renderStatus(opts: {
  stamina: number | undefined;
  raceStamina: boolean;
  staminaConfig?: { taper_floor?: number; tired_multiplier?: number };
}): string {
  const race = {
    name: 'Test Race', status: 'live', time_left_seconds: 600,
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 600_000).toISOString(),
    server_time: new Date().toISOString(),
    stamina: opts.raceStamina,
    stamina_config: opts.staminaConfig,
    horses: [horse({ stamina: opts.stamina })],
  } as unknown as GetRaceResponse;

  const { lastFrame } = render(
    <StatusScreen
      race={race}
      ownHorseId="b"
      ownHorseName="Beta"
      ownColors={COLORS}
      ownUserName="BetaOwner"
      lastHeartbeatAgoSec={12}
      lastHeartbeatOk
    />,
  );
  return lastFrame() ?? '';
}

describe('StatusScreen stamina line', () => {
  it('shows the stamina bar in green when fresh', () => {
    const out = renderStatus({ stamina: 80, raceStamina: true });
    expect(out).toMatch(/Stamina/);
  });

  it('shows the live multiplier when in the red band', () => {
    const out = renderStatus({ stamina: 12.5, raceStamina: true });
    expect(out).toContain('×0.75');
  });

  it('omits the stamina line when the race has stamina off', () => {
    expect(renderStatus({ stamina: undefined, raceStamina: false })).not.toMatch(/Stamina/);
  });

  it("bands red at the race's own snapshotted taper floor, not the STAMINA default", () => {
    // Floor 40, stamina 35: below the org's own floor (red), even though 35 sits
    // above the default floor of 25 (which would render amber). A hardcoded
    // STAMINA.TAPER_FLOOR would band this amber and show no multiplier at all.
    const out = renderStatus({ stamina: 35, raceStamina: true, staminaConfig: { taper_floor: 40 } });
    expect(out).toContain('×0.94');
  });
});

describe('StatusScreen scored vs raw tokens', () => {
  it("shows the racer's own scored figure, not raw current_tokens, when they differ", () => {
    const race = {
      name: 'Test Race', status: 'live', time_left_seconds: 600,
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 600_000).toISOString(),
      server_time: new Date().toISOString(),
      stamina: true,
      horses: [horse({ current_tokens: 12_000, scored_tokens: 8_000 })],
    } as unknown as GetRaceResponse;

    const { lastFrame } = render(
      <StatusScreen
        race={race}
        ownHorseId="b"
        ownHorseName="Beta"
        ownColors={COLORS}
        ownUserName="BetaOwner"
        lastHeartbeatAgoSec={12}
        lastHeartbeatOk
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('8000');
    expect(out).not.toContain('12000');
  });

  it("shows the leader's scored figure, not raw current_tokens, when they differ", () => {
    const leaderHorse = horse({
      horse_id: 'a', stable_horse_id: 's-a', name: 'Alpha', rank: 1,
      current_tokens: 20_000, scored_tokens: 6_000,
    });
    const ownHorse = horse({ rank: 2, current_tokens: 5_000, scored_tokens: 5_000 });
    const race = {
      name: 'Test Race', status: 'live', time_left_seconds: 600,
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 600_000).toISOString(),
      server_time: new Date().toISOString(),
      stamina: true,
      horses: [leaderHorse, ownHorse],
    } as unknown as GetRaceResponse;

    const { lastFrame } = render(
      <StatusScreen
        race={race}
        ownHorseId="b"
        ownHorseName="Beta"
        ownColors={COLORS}
        ownUserName="BetaOwner"
        lastHeartbeatAgoSec={12}
        lastHeartbeatOk
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('6000');
    expect(out).not.toContain('20000');
  });
});
