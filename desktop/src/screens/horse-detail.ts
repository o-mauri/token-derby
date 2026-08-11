import type { HorseView, RaceView } from '@token-derby/shared';
import { resolveStaminaConfig } from '@token-derby/shared';
import { tokensFor } from './race-standings.js';

export type DetailTone = 'good' | 'warn' | 'bad';

// One line of the expanded horse panel. `bar` is a 0..1 fraction for rows that
// render a meter behind the value (stamina); absent means text only.
export type DetailRow = {
  label: string;
  value: string;
  tone?: DetailTone;
  bar?: number;
};

// A horse beating within two 60s intervals is still actively racing. Kept local
// rather than imported from @token-derby/token-engine: that package's entrypoint
// pulls in the transcript scanners, which import node:fs and cannot be bundled
// into the renderer.
const BEAT_OK_WITHIN_SEC = 120;

function exact(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// Bands match cli/src/ui/StatusScreen.tsx's staminaLine(): green above 50, amber
// down to the org's taper floor, red below it — where scoring starts costing.
function staminaRow(race: RaceView, horse: HorseView): DetailRow {
  const stamina = horse.stamina ?? 100;
  const cfg = resolveStaminaConfig(race);
  const floor = cfg.taper_floor;
  const tone: DetailTone = stamina > 50 ? 'good' : stamina >= floor ? 'warn' : 'bad';

  // Only meaningful in the red band: it's the factor output is being scaled by
  // right now, so showing it earlier would imply a penalty that isn't applied.
  const multiplier = tone === 'bad'
    ? cfg.tired_multiplier + (1 - cfg.tired_multiplier) * (stamina / floor)
    : null;

  return {
    label: 'Stamina',
    value: `${Math.round(stamina)}%${multiplier !== null ? `  ×${multiplier.toFixed(2)}` : ''}`,
    tone,
    bar: Math.max(0, Math.min(1, stamina / 100)),
  };
}

function beatRow(race: RaceView, horse: HorseView): DetailRow {
  const beatMs = new Date(horse.last_heartbeat).getTime();
  const nowMs = new Date(race.server_time).getTime();
  if (!Number.isFinite(beatMs) || !Number.isFinite(nowMs)) {
    return { label: 'Beat', value: '—' };
  }
  // Server time is authoritative — using the local clock would report a skewed
  // age for every horse, including other people's.
  const agoSec = Math.max(0, Math.round((nowMs - beatMs) / 1000));
  return {
    label: 'Beat',
    value: `${agoSec}s ago`,
    tone: agoSec <= BEAT_OK_WITHIN_SEC ? 'good' : 'warn',
  };
}

// The detail lines for one horse, in display order. Stamina and pace drop out
// entirely when they don't apply, rather than rendering a placeholder.
export function detailRows(race: RaceView, horse: HorseView): DetailRow[] {
  const rows: DetailRow[] = [];
  if (race.stamina === true) rows.push(staminaRow(race, horse));

  // Same figure the standings list shows, just not abbreviated.
  rows.push({ label: 'Tokens', value: exact(tokensFor(race, horse)) });

  if (horse.pace_15m !== undefined) {
    rows.push({ label: 'Pace', value: `${exact(horse.pace_15m)} /min` });
  }

  rows.push(beatRow(race, horse));
  return rows;
}
