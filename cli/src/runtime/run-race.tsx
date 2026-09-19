import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import type { GetRaceResponse, HeartbeatResponse } from '@token-derby/shared';
import { StatusScreen } from '../ui/StatusScreen.js';
import { describeAchievement, type RecentEvent } from '@token-derby/shared';
import { runHeartbeatLoop } from './heartbeat-loop.js';
import { readAllSources, isStall, scanWithTimeout, type BeatReading, type DegradedSource } from '../tokens/race-tokens.js';
import { ScanProgress, diagnoseScanTimeout } from '../tokens/scan-progress.js';
import { MODEL_FAMILIES, zeroPerFamily, type ModelFamily } from '@token-derby/shared';
import { RaceScoreTracker, type RaceScoreState } from '../tokens/race-score.js';
import * as endpoints from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { loadPrefs, isHarnessEnabled } from '../stable/prefs.js';
import { HARNESS_KEYS, type HarnessKey } from '../tokens/harnesses/registry.js';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_RETRY_DELAYS_MS, SCAN_TIMEOUT_MS } from '../config.js';

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

  const trackerRef = useRef(new RaceScoreTracker(initialState));
  const pendingRef = useRef(pendingMode);
  const ctrl = useRef(new AbortController());
  const [stalled, setStalled] = useState(false);
  const [stallReason, setStallReason] = useState<string | null>(null);
  const [sourcesSilent, setSourcesSilent] = useState(false);
  const [degraded, setDegraded] = useState<DegradedSource[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [disabledHarnesses, setDisabledHarnesses] = useState<HarnessKey[]>([]);

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

    const scanBeat = async (): Promise<BeatReading> => {
      const progress = new ScanProgress();
      try {
        return await scanWithTimeout(
          () => readAllSources(progress),
          SCAN_TIMEOUT_MS,
          () => diagnoseScanTimeout(SCAN_TIMEOUT_MS, progress),
        );
      } catch (e: any) {
        return { stall: `Token scan failed: ${e?.message ?? String(e)}` };
      }
    };

    runHeartbeatLoop({
      prepareBeat: async () => {
        const reading = await scanBeat();
        tracker.recordReading(reading);
        if (pendingRef.current && !isStall(reading)) tracker.reprime();
        setStalled(tracker.stalled);
        setStallReason(tracker.stalled ? tracker.stallReason : null);
        setSourcesSilent(tracker.sourcesSilent);
        // Tracks the current beat rather than a streak: a source that reads
        // cleanly again clears its own warning immediately.
        setDegraded(isStall(reading) ? [] : reading.degraded);
        setNotices(isStall(reading) ? [] : reading.notices);
        // Re-read each beat so a toggle shows up without restarting.
        const prefs = await loadPrefs();
        setDisabledHarnesses(HARNESS_KEYS.filter(k => !isHarnessEnabled(prefs, k)));
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
        sourcesSilent={sourcesSilent}
        degraded={degraded}
        notices={notices}
        disabledHarnesses={disabledHarnesses}
      />
      {achievements.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Achievements</Text>
          {achievements.map(({ key, event }) => {
            const description = describeAchievement(event);
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
  // Anchors always come from a fresh scan, never from the persisted state — that
  // is what stops a rejoin counting the player's whole transcript history.
  const convAcked: Record<ModelFamily, Record<string, number>> = { anthropic: {}, openai: {}, google: {} };
  try {
    const now = await readAllSources();
    if (!isStall(now)) {
      for (const family of MODEL_FAMILIES) {
        for (const [id, value] of now.byFamily[family]) convAcked[family][id] = value;
      }
    }
  } catch { /* leave empty */ }
  return {
    initialState: {
      convAcked,
      counted: zeroPerFamily(),
      seq: args.serverLastSeq,
    },
    pendingMode: args.raceStatus === 'pending',
  };
}
