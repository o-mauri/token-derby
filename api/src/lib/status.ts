import type { Race, RaceStatus } from '@token-derby/shared';

export function computeStatus(race: Race, now: Date): RaceStatus {
  if (race.ended_at) return 'finished';
  const nowMs = now.getTime();
  if (nowMs >= new Date(race.end_time).getTime()) return 'finished';
  if (nowMs < new Date(race.start_time).getTime()) return 'pending';
  return 'live';
}

export function timeLeftSeconds(race: Race, now: Date): number {
  const delta = new Date(race.end_time).getTime() - now.getTime();
  return Math.max(0, Math.floor(delta / 1000));
}
