import type { GetRaceResponse, HeartbeatResponse, RaceStatus } from '@token-derby/shared';
import type { ActiveRaceStatus } from '../ipc.js';

// Either shape the engine hands in: a fresh GetRaceResponse (join/resume) or
// a HeartbeatResponse (each beat ack). Their status field and join code live
// at different paths, so pick whichever branch is present.
type StatusSource = GetRaceResponse | HeartbeatResponse;

function joinCodeOf(resp: StatusSource): string {
  return 'race' in resp ? resp.race.join_code : resp.join_code;
}

function raceStatusOf(resp: StatusSource): RaceStatus {
  return 'race_status' in resp ? resp.race_status : resp.status;
}

// Pure: finds the racing horse's rank/tokens in resp.horses and combines
// them with the caller-supplied identity (horseId) and display name
// (raceName — the engine tracks this separately since neither response shape
// is guaranteed to carry it on every call site). `stalled` is the score
// tracker's own stall state, not derivable from a server response.
export function deriveStatus(
  resp: StatusSource,
  horseId: string,
  raceName: string,
  stalled = false,
): ActiveRaceStatus {
  const horse = resp.horses.find(h => h.horse_id === horseId);
  return {
    joinCode: joinCodeOf(resp),
    raceName,
    horseId,
    rank: horse?.rank ?? null,
    tokens: horse?.current_tokens ?? 0,
    status: raceStatusOf(resp),
    stalled,
  };
}
