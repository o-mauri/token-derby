import React from 'react';
import { Box, Text } from 'ink';
import type { GetRaceResponse, HorseColors, HorseView } from '@token-derby/shared';
import { HorseSprite } from './HorseSprite.js';
import { MINI_SPRITE } from './sprite.js';

type Props = {
  race: GetRaceResponse | null;
  ownHorseId: string;
  ownHorseName: string;
  ownColors: HorseColors;
  lastHeartbeatAgoSec: number | null;
  lastHeartbeatOk: boolean;
};

export function StatusScreen(props: Props) {
  const { race, ownHorseId, ownHorseName, ownColors, lastHeartbeatAgoSec, lastHeartbeatOk } = props;

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

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>
        🏇 TOKEN DERBY ─── <Text bold>{race.name}</Text> ─── status: <Text color={statusColor(race.status)}>{race.status}</Text>
      </Text>

      <Box marginTop={1} flexDirection="row">
        <HorseSprite sprite={MINI_SPRITE} colors={ownColors} />
        <Text>  {ownHorseName}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>Tokens (race):  {own?.current_tokens ?? 0}</Text>
        <Text>Position:       {own?.rank ?? '—'} of {race.horses.length}</Text>
        <Text>
          Leader:         {leader ? `${leader.name} (${leader.current_tokens})` : '—'}
        </Text>
        <Text>Race elapsed:   {(elapsedPct * 100).toFixed(0)}%  {bar(elapsedPct, 20)}</Text>
        <Text>Time left:      {timeLeft}</Text>
        <Text>
          Last heartbeat: {lastHeartbeatAgoSec === null ? '—' : `${lastHeartbeatAgoSec}s ago`}
          {' '}
          <Text color={lastHeartbeatOk ? 'green' : 'yellow'}>
            {lastHeartbeatOk ? '✓' : '⚠'}
          </Text>
        </Text>
      </Box>

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
