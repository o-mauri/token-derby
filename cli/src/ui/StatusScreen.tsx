import React from 'react';
import { Box, Text } from 'ink';
import type { GetRaceResponse, HorseColors, HorseView } from '@token-derby/shared';
import { levelInfo, resolveStaminaConfig, scoredOf, staminaOf } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';
import { SILENT_THRESHOLD } from '../config.js';
import type { DegradedSource } from '../tokens/race-tokens.js';
import { HARNESSES, HARNESS_KEYS, type HarnessKey } from '../tokens/harnesses/registry.js';



export function ModelList(props: { disabled?: HarnessKey[] }) {
  const off = new Set(props.disabled ?? []);
  return (
    <Box marginTop={1}>
      <Text>
        {'Counting:  '}
        {HARNESS_KEYS.map((key, i) => (
          <Text key={key}>
            {i > 0 ? ' · ' : ''}
            {/* A harness turned off is shown, not hidden: "why isn't my Codex
                work counting?" should be answerable from this line alone. */}
            {off.has(key)
              ? <Text dimColor>{HARNESSES[key].label} (off)</Text>
              : HARNESSES[key].label}
          </Text>
        ))}
        <Text dimColor>{'  (all count the same)'}</Text>
      </Text>
    </Box>
  );
}

type Props = {
  race: GetRaceResponse | null;
  ownHorseId: string;
  ownHorseName: string;
  ownColors: HorseColors;
  ownUserName: string;
  lastHeartbeatAgoSec: number | null;
  lastHeartbeatOk: boolean;
  stalled?: boolean;
  stallReason?: string | null;
  sourcesSilent?: boolean;
  degraded?: DegradedSource[];
  notices?: string[];
  disabledHarnesses?: HarnessKey[];
};

export function StatusScreen(props: Props) {
  const { race, ownHorseId, ownHorseName, ownColors, ownUserName, lastHeartbeatAgoSec, lastHeartbeatOk, stalled, stallReason, sourcesSilent, degraded, notices, disabledHarnesses } = props;

  if (!race) {
    return (
      <Box flexDirection="column">
        <Text>Joining race…</Text>
      </Box>
    );
  }

  const own: HorseView | undefined = race.horses.find(h => h.horse_id === ownHorseId);
  const leader: HorseView | undefined = race.horses[0];
  const elapsedPct = elapsed(race);
  const timeLeft = formatDuration(race.time_left_seconds);
  const lvl = levelInfo((own?.xp ?? 0) + (own?.live_xp ?? 0));

  // Divisions exist only on league fixtures, and only once the horse has been
  // placed in one. `race.horses` arrives rank-sorted, so filtering preserves order.
  const divisionField = own?.division === undefined
    ? []
    : race.horses.filter(h => h.division === own.division);
  const divisionRank = own ? divisionField.indexOf(own) + 1 : 0;
  const showDivision = (race.league_division_names?.length ?? 0) > 0 && divisionRank > 0;

  const staminaRow = race.stamina === true ? staminaLine(own, race) : null;

  const rows: StatRow[] = [
    { label: 'Tokens (race):', value: String(own?.final_scored_tokens ?? (own ? scoredOf(own) : 0)) },
    ...(staminaRow ? [staminaRow] : []),
    { label: 'Position:', value: `${own?.rank ?? '—'} of ${race.horses.length}` },
    ...(showDivision
      ? [{ label: 'Position (Division):', value: `${divisionRank} of ${divisionField.length}` }]
      : []),
    { label: 'Leader:', value: leaderText(leader) },
    ...(showDivision
      ? [{ label: 'Leader (Division):', value: leaderText(divisionField[0]) }]
      : []),
    { label: 'Race elapsed:', value: `${(elapsedPct * 100).toFixed(0)}%  ${bar(elapsedPct, 20)}` },
    { label: 'Time left:', value: timeLeft },
    {
      label: 'XP:',
      value: lvl.next_level_xp === null
        ? `${lvl.xp} (max level)  ${bar(1, 20)}`
        : `${lvl.xp_into_level}/${lvl.xp_for_level} → Lvl. ${lvl.level + 1}  ${bar(lvl.progress, 20)}`,
    },
    {
      label: 'Last heartbeat:',
      value: (
        <>
          {lastHeartbeatAgoSec === null ? '—' : `${lastHeartbeatAgoSec}s ago`}
          {' '}
          <Text color={lastHeartbeatOk ? 'green' : 'yellow'}>{lastHeartbeatOk ? '✓' : '⚠'}</Text>
        </>
      ),
    },
  ];

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>
        🏇 TOKEN DERBY ─── <Text bold>{race.name}</Text> ─── status: <Text color={statusColor(race.status)}>{race.status}</Text>
      </Text>

      <Box marginTop={1} flexDirection="row">
        <HorseSprite sprite={MINI_SPRITE} colors={ownColors} />
        <Box flexDirection="column">
          <Text>  {ownHorseName} <Text color="cyan">[Lvl. {lvl.level}]</Text></Text>
          <Text>  <Text dimColor>({ownUserName})</Text></Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <StatLines rows={rows} />
        {stalled && (
          <Text color="yellow">⚠ {stallReason ?? "Can't read token usage"}. Your race continues.</Text>
        )}
        {/* A stall names a more specific cause, so it wins the one warning slot. */}
        {!stalled && (degraded?.length ?? 0) > 0 && degraded!.map(d => (
          <Text key={d.harness} color="yellow">
            ⚠ {d.label} not counted this beat — {d.message}. Your other sources
            still count, and {d.label} catches up once it can be read.
          </Text>
        ))}
        {!stalled && (notices?.length ?? 0) > 0 && notices!.map(n => (
          <Text key={n} color="yellow">⚠ {n}</Text>
        ))}
        {!stalled && (degraded?.length ?? 0) === 0 && sourcesSilent && (
          <Text color="yellow">
            ⚠ No transcripts from any coding agent in {SILENT_THRESHOLD} beats. Your race
            continues, but your horse cannot move until they can be read.
          </Text>
        )}
      </Box>

      <ModelList disabled={disabledHarnesses} />

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to crash out of the race.</Text>
      </Box>
    </Box>
  );
}

type StatRow = { label: string; value: React.ReactNode };

// Values line up one space past the widest label actually rendered, so the
// column tightens when the division rows are absent.
function StatLines(props: { rows: StatRow[] }) {
  const width = Math.max(...props.rows.map(r => r.label.length)) + 1;
  return (
    <>
      {props.rows.map(r => (
        <Text key={r.label}>{r.label.padEnd(width)}{r.value}</Text>
      ))}
    </>
  );
}

function leaderText(h: HorseView | undefined): string {
  if (!h) return '—';
  return `${h.name}${h.user_name ? ` (${h.user_name})` : ''} — ${h.final_scored_tokens ?? scoredOf(h)}`;
}

function elapsed(race: GetRaceResponse): number {
  const start = new Date(race.start_time).getTime();
  const end = new Date(race.end_time).getTime();
  const now = new Date(race.server_time).getTime();
  if (end <= start) return 0;
  const v = (now - start) / (end - start);
  return Math.max(0, Math.min(1, v));
}

function bar(pct: number, width: number): string {
  const filled = Math.round(pct * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

// Bands match the race page exactly: green above 50, amber down to the org's
// taper floor, red below it — where scoring actually starts costing.
function staminaLine(own: HorseView | undefined, race: GetRaceResponse): StatRow {
  const stamina = staminaOf(own ?? {});
  const cfg = resolveStaminaConfig(race);
  const floor = cfg.taper_floor;
  const band = stamina > 50 ? 'green' : stamina >= floor ? 'amber' : 'red';
  const color = band === 'green' ? 'green' : band === 'amber' ? 'yellow' : 'red';
  const pct = Math.max(0, Math.min(1, stamina / 100));

  // Multiplier only in the red band: it's the number their output is being
  // scaled by right now, so it only matters once tapering has begun.
  const multiplier = band === 'red'
    ? cfg.tired_multiplier + (1 - cfg.tired_multiplier) * (stamina / floor)
    : null;

  return {
    label: 'Stamina:',
    value: (
      <Text color={color}>
        {`${Math.round(stamina)}%  ${bar(pct, 20)}`}
        {multiplier !== null ? `  ×${multiplier.toFixed(2)}` : ''}
      </Text>
    ),
  };
}

function statusColor(status: GetRaceResponse['status']): string {
  if (status === 'live') return 'green';
  if (status === 'pending') return 'yellow';
  return 'gray';
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}
