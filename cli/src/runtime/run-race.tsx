import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { GetRaceResponse, HeartbeatResponse } from '@token-derby/shared';
import { StatusScreen } from '../ui/StatusScreen.js';
import { AchievementToast } from '../ui/AchievementToast.js';
import { ACHIEVEMENT_DESCRIPTIONS, overtakeDescription, type RecentEvent } from '@token-derby/shared';
import { runHeartbeatLoop } from './heartbeat-loop.js';
import { sumOutputTokens } from '../tokens/transcripts.js';
import { initialBaseline } from '../tokens/baseline.js';
import * as endpoints from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_RETRY_DELAYS_MS } from '../config.js';

export type RunRaceProps = {
  active: ActiveRace;
  startingBaseline: number;
  pendingMode: boolean;
  ownUserName: string;
};

export function RunRace({ active, startingBaseline, pendingMode, ownUserName }: RunRaceProps) {
  const { exit } = useApp();
  const [race, setRace] = useState<GetRaceResponse | null>(null);
  const [lastHbAt, setLastHbAt] = useState<Date | null>(null);
  const [lastHbOk, setLastHbOk] = useState<boolean>(true);
  const [tickNow, setTickNow] = useState<Date>(new Date());
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ key: string; event: RecentEvent }>>([]);
  const shownToastAtRef = useRef<number>(0);

  const baselineRef = useRef(startingBaseline);
  const pendingRef = useRef(pendingMode);
  const lastTokenSampleRef = useRef<number>(startingBaseline);
  const ctrl = useRef(new AbortController());

  // Re-render every second so the "Ns ago" counter updates.
  useEffect(() => {
    const t = setInterval(() => setTickNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // Re-snapshot baseline when race transitions pending → live.
  useEffect(() => {
    if (pendingRef.current && race?.status === 'live') {
      sumOutputTokens().then(total => {
        baselineRef.current = total;
        pendingRef.current = false;
      });
    }
  }, [race?.status]);

  useEffect(() => {
    runHeartbeatLoop({
      sendHeartbeat: async (currentTokens) => {
        const resp = await endpoints.heartbeat(
          active.join_code, active.horse_id, active.heartbeat_token, { current_tokens: currentTokens },
        );
        const updated: ActiveRace = {
          ...active,
          last_race_tokens: currentTokens,
          last_heartbeat_at: new Date().toISOString(),
        };
        await saveActiveRace(updated);
        return resp;
      },
      getCurrentTokens: () => {
        if (pendingRef.current) return 0;
        return Math.max(0, lastTokenSampleRef.current - baselineRef.current);
      },
      intervalMs: HEARTBEAT_INTERVAL_MS,
      retryDelaysMs: HEARTBEAT_RETRY_DELAYS_MS,
      onSuccess: (resp: HeartbeatResponse) => {
        setLastHbAt(new Date());
        setLastHbOk(true);
        setRace(raceViewFrom(resp));
        const own = resp.horses.find(h => h.horse_id === active.horse_id);
        const candidates = (own?.recent_events ?? []).filter(e => e.at > shownToastAtRef.current);
        if (candidates.length > 0) {
          shownToastAtRef.current = Math.max(...candidates.map(e => e.at));
          const fresh = candidates.map(e => ({ key: `${e.at}-${e.name}`, event: e }));
          setToasts(prev => [...prev, ...fresh]);
          for (const { key } of fresh) {
            setTimeout(() => setToasts(prev => prev.filter(t => t.key !== key)), 10_000);
          }
        }
        if (resp.race_status === 'finished') exit();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'VERSION_MISMATCH') {
          setFatalError(err.message);
          ctrl.current.abort();
          exit();
          return;
        }
        setLastHbOk(false);
      },
      onFinished: () => exit(),
      abortSignal: ctrl.current.signal,
    });

    // Token sampler — refresh the running token total every 5s so the heartbeat sees fresh data.
    const sampler = setInterval(async () => {
      try {
        lastTokenSampleRef.current = await sumOutputTokens();
      } catch (e) {
        console.error('[token-derby] token sampler failed:', e);
      }
    }, 5_000);
    // Prime it once at startup.
    sumOutputTokens()
      .then(t => { lastTokenSampleRef.current = t; })
      .catch(e => console.error('[token-derby] token sampler prime failed:', e));

    const controller = ctrl.current;
    return () => {
      clearInterval(sampler);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastHeartbeatAgoSec = lastHbAt
    ? Math.max(0, Math.floor((tickNow.getTime() - lastHbAt.getTime()) / 1000))
    : null;

  if (fatalError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>CLI version mismatch — disconnected</Text>
        <Text>{fatalError}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <StatusScreen
        race={race}
        ownHorseId={active.horse_id}
        ownHorseName={active.horse_name}
        ownColors={active.horse_colors}
        ownUserName={ownUserName}
        lastHeartbeatAgoSec={lastHeartbeatAgoSec}
        lastHeartbeatOk={lastHbOk}
      />
      {toasts.slice(0, 3).map(({ key, event }) => (
        <AchievementToast
          key={key}
          horseName={active.horse_name}
          name={event.name}
          description={event.name === 'Overtake!'
            ? overtakeDescription(Math.floor(event.xp / 3))
            : ACHIEVEMENT_DESCRIPTIONS[event.name]}
          xp={event.xp}
        />
      ))}
    </Box>
  );
}

function raceViewFrom(resp: HeartbeatResponse): GetRaceResponse {
  return {
    ...resp.race,
    status: resp.race_status,
    horses: resp.horses,
    server_time: resp.server_time,
    time_left_seconds: resp.time_left_seconds,
  };
}

export async function buildInitialState(args: {
  active: ActiveRace;
  raceStatus: 'pending' | 'live';
  rejoin: boolean;
}): Promise<{ startingBaseline: number; pendingMode: boolean }> {
  const runningTotal = await sumOutputTokens();
  if (args.rejoin) {
    return {
      startingBaseline: Math.max(0, runningTotal - args.active.last_race_tokens),
      pendingMode: args.raceStatus === 'pending',
    };
  }
  return {
    startingBaseline: initialBaseline({ runningTotal, status: args.raceStatus }),
    pendingMode: args.raceStatus === 'pending',
  };
}
