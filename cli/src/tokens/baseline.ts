import type { RaceStatus } from '@token-derby/shared';

export function initialBaseline(args: { runningTotal: number; status: RaceStatus }): number {
  return args.runningTotal;
}

export function rejoinBaseline(args: { runningTotal: number; lastRaceTokens: number }): number {
  return Math.max(0, args.runningTotal - args.lastRaceTokens);
}

export function currentRaceTokens(runningTotal: number, baseline: number): number {
  return Math.max(0, runningTotal - baseline);
}
