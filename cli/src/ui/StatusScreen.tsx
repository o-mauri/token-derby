import React from 'react';
import { Box, Text } from 'ink';
import type { GetRaceResponse, HorseColors, HorseView } from '@token-derby/shared';
import { levelInfo, MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';

const MODEL_LABELS: Record<ModelKey, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };

export function TokenBreakdown(props: {
  primaryModel: ModelKey;
  perSource: Record<ModelKey, number>;
  raceScore: number;
}) {
  const { primaryModel, perSource, raceScore } = props;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Tokens by model (since join)</Text>
      {MODEL_KEYS.map(m => (
        <Text key={m}>
          {`  ${MODEL_LABELS[m].padEnd(8)} ${perSource[m].toLocaleString().padStart(12)}  `}
          <Text dimColor>{m === primaryModel ? '(primary)' : '(10%)'}</Text>
        </Text>
      ))}
      <Text>{`  ${'Race score'.padEnd(8)} ${Math.round(raceScore).toLocaleString().padStart(12)}`}</Text>
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
  primaryModel?: ModelKey;
  perSource?: Record<ModelKey, number>;
};

export function StatusScreen(props: Props) {
  const { race, ownHorseId, ownHorseName, ownColors, ownUserName, lastHeartbeatAgoSec, lastHeartbeatOk, stalled, primaryModel, perSource } = props;

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
        <Text>Tokens (race):  {own?.current_tokens ?? 0}</Text>
        <Text>Position:       {own?.rank ?? '—'} of {race.horses.length}</Text>
        <Text>
          Leader:         {leader ? `${leader.name}${leader.user_name ? ` (${leader.user_name})` : ''} — ${leader.current_tokens}` : '—'}
        </Text>
        <Text>Race elapsed:   {(elapsedPct * 100).toFixed(0)}%  {bar(elapsedPct, 20)}</Text>
        <Text>Time left:      {timeLeft}</Text>
        <Text>
          XP:             {lvl.next_level_xp === null
            ? `${lvl.xp} (max level)  ${bar(1, 20)}`
            : `${lvl.xp_into_level}/${lvl.xp_for_level} → Lvl. ${lvl.level + 1}  ${bar(lvl.progress, 20)}`}
        </Text>
        <Text>
          Last heartbeat: {lastHeartbeatAgoSec === null ? '—' : `${lastHeartbeatAgoSec}s ago`}
          {' '}
          <Text color={lastHeartbeatOk ? 'green' : 'yellow'}>
            {lastHeartbeatOk ? '✓' : '⚠'}
          </Text>
        </Text>
        {stalled && (
          <Text color="yellow">⚠ Can't read token usage — try restarting this terminal. Your race continues.</Text>
        )}
      </Box>

      {primaryModel && perSource && (
        <TokenBreakdown
          primaryModel={primaryModel}
          perSource={perSource}
          raceScore={own?.current_tokens ?? 0}
        />
      )}

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to crash out of the race.</Text>
      </Box>
    </Box>
  );
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
