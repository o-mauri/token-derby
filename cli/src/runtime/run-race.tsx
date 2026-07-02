import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { GetRaceResponse, HeartbeatResponse } from '@token-derby/shared';
import { StatusScreen } from '../ui/StatusScreen.js';
import { describeAchievement, type RecentEvent } from '@token-derby/shared';
import { runHeartbeatLoop } from './heartbeat-loop.js';
import { readAllSources, isStall, type BeatReading } from '../tokens/race-tokens.js';
import { primaryConversationCap } from '../tokens/primary-cap.js';
import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { RaceScoreTracker, type RaceScoreState } from '../tokens/race-score.js';
import * as endpoints from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_RETRY_DELAYS_MS } from '../config.js';

export type RunRaceProps = {
  active: ActiveRace;
  initialState: RaceScoreState;   // seeded by join.ts (anchors primed, seq from server)
  pendingMode: boolean;
  ownUserName: string;
};

export function RunRace({ active, initialState, pendingMode, ownUserName }: RunRaceProps) {
  const { exit } = useApp();
  const [race, setRace] = useState<GetRaceResponse | null>(null);
  const [lastHbAt, setLastHbAt] = useState<Date | null>(null);
  const [lastHbOk, setLastHbOk] = useState<boolean>(true);
  const [tickNow, setTickNow] = useState<Date>(new Date());
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Array<{ key: string; event: RecentEvent }>>([]);
  const shownAchievementAtRef = useRef<number>(0);

  const trackerRef = useRef(new RaceScoreTracker(initialState, active.primary_model, active.primary_top5 ?? false));
  const pendingRef = useRef(pendingMode);
  const ctrl = useRef(new AbortController());
  const [stalled, setStalled] = useState(false);
  const [stallReason, setStallReason] = useState<string | null>(null);
  const baselineRef = useRef(initialState.acked);
  const [perSource, setPerSource] = useState<Record<ModelKey, number>>({ claude: 0, codex: 0, gemini: 0 });

  // Re-render every second so the "Ns ago" counter updates.
  useEffect(() => {
    const t = setInterval(() => setTickNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // Re-prime the anchor when the race goes live so pre-live tokens aren't counted.
  useEffect(() => {
    if (pendingRef.current && race?.status === 'live') {
      trackerRef.current.reprime();
      pendingRef.current = false;
    }
  }, [race?.status]);

  useEffect(() => {
    const tracker = trackerRef.current;

    const scanWithTimeout = async (): Promise<BeatReading> => {
      try {
        return await Promise.race([
          readAllSources(active, active.primary_model),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('scan timeout')), 10_000)),
        ]);
      } catch {
        return { stall: 'Token scan timed out' };
      }
    };

    runHeartbeatLoop({
      prepareBeat: async () => {
        const reading = await scanWithTimeout();
        tracker.recordReading(reading);
        if (pendingRef.current && !isStall(reading)) tracker.reprime();
        setStalled(tracker.stalled);
        setStallReason(tracker.stalled ? tracker.stallReason : null);
        const since = tracker.secondarySinceJoin(baselineRef.current);
        const ps: Record<ModelKey, number> = { claude: 0, codex: 0, gemini: 0 };
        for (const k of MODEL_KEYS) {
          ps[k] = k === active.primary_model ? tracker.primaryCounted() : since[k];
        }
        setPerSource(ps);
        return tracker.nextBeat();
      },
      sendBeat: async (snapshot) => {
        return endpoints.heartbeat(active.join_code, active.horse_id, active.heartbeat_token, {
          seq: snapshot.seq, components: snapshot.components,
        });
      },
      onSuccess: (resp, snapshot) => {
        tracker.ack(snapshot, resp.last_seq);
        const updated: ActiveRace = {
          ...active,
          score: tracker.toState(),
          last_heartbeat_at: new Date().toISOString(),
        };
        void saveActiveRace(updated);
        setLastHbAt(new Date());
        setLastHbOk(true);
        setRace(raceViewFrom(resp));
        const own = resp.horses.find(h => h.horse_id === active.horse_id);
        const candidates = (own?.recent_events ?? []).filter(e => e.at > shownAchievementAtRef.current);
        if (candidates.length > 0) {
          shownAchievementAtRef.current = Math.max(...candidates.map(e => e.at));
          const freshEvents = candidates.map(e => ({ key: `${e.at}-${e.name}`, event: e }));
          setAchievements(prev => [...prev, ...freshEvents]);
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
      intervalMs: HEARTBEAT_INTERVAL_MS,
      retryDelaysMs: HEARTBEAT_RETRY_DELAYS_MS,
      abortSignal: ctrl.current.signal,
    });

    const controller = ctrl.current;
    return () => { controller.abort(); };
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
        stalled={stalled}
        stallReason={stallReason}
        primaryModel={active.primary_model}
        perSource={perSource}
        primaryCapped={primaryConversationCap(active.primary_top5 ?? false) !== Infinity}
      />
      {achievements.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Achievements</Text>
          {achievements.map(({ key, event }) => {
            const description = describeAchievement(event, active);
            return (
              <Box key={key} flexDirection="row">
                <Text dimColor>  {formatClockTime(event.at)}  </Text>
                <Text color="yellow" bold>+{event.xp} XP  </Text>
                <Text>{event.name}</Text>
                <Text dimColor>  — {description}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function formatClockTime(at: number): string {
  const d = new Date(at);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
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
  serverLastSeq: number;
}): Promise<{ initialState: RaceScoreState; pendingMode: boolean }> {
  let secondary: Record<ModelKey, number> = { claude: 0, codex: 0, gemini: 0 };
  const primaryConvAcked: Record<string, number> = {};
  try {
    const now = await readAllSources(args.active, args.active.primary_model);
    if (!isStall(now)) {
      secondary = now.secondary;
      for (const [id, v] of now.primaryByConv) primaryConvAcked[id] = v;
    }
  } catch { /* leave zeros */ }
  return {
    initialState: {
      acked: { ...secondary },
      lastGood: { ...secondary },
      primaryConvAcked,
      primaryCounted: 0,
      seq: args.serverLastSeq,
    },
    pendingMode: args.raceStatus === 'pending',
  };
}
