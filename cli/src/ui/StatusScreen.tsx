import React from 'react';
import { Box, Text } from 'ink';
import type { GetRaceResponse, HorseColors, HorseView } from '@token-derby/shared';
import { levelInfo, MODEL_KEYS, SECONDARY_WEIGHT, type ModelKey } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';

const MODEL_LABELS: Record<ModelKey, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

export function ModelList(props: { primaryModel: ModelKey }) {
  const { primaryModel } = props;
  const secondaryTag = ` (${Math.round(SECONDARY_WEIGHT * 100)}%)`;
  return (
    <Box marginTop={1}>
      <Text>
        {'Models:  '}
        {MODEL_KEYS.map((m, i) => (
          <Text key={m}>
            {i > 0 ? ' · ' : ''}
            {MODEL_LABELS[m]}
            <Text dimColor>{m === primaryModel ? ' (primary)' : secondaryTag}</Text>
          </Text>
        ))}
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
  primaryModel?: ModelKey;
};

export function StatusScreen(props: Props) {
  const { race, ownHorseId, ownHorseName, ownColors, ownUserName, lastHeartbeatAgoSec, lastHeartbeatOk, stalled, stallReason, primaryModel } = props;

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

  const rows: StatRow[] = [
    { label: 'Tokens (race):', value: String(own?.current_tokens ?? 0) },
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
      </Box>

      {primaryModel && <ModelList primaryModel={primaryModel} />}

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
  return `${h.name}${h.user_name ? ` (${h.user_name})` : ''} — ${h.current_tokens}`;
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
