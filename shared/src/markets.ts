// The odds model. Pure arithmetic — no I/O, no clock, no randomness that
// isn't seeded. Every constant here was fitted against real races; see the
// design doc before changing any of them.

import { hashSeed, mulberry32, gammaSampler } from './random.js';
import type { AttendanceDraws } from './attendance/sampler.js';
import { projectedMultiplier } from './scoring/projection.js';

export const PACE_PRIOR_CROSSOVER_MIN = 120;
export const MARGIN = 0.01;
export const SIMULATIONS = 10_000;
export const MARKET_OPEN_MIN = 20;

// Only the trailing window matters to the odds model's prior — an old horse
// with hundreds of races shouldn't seed from its whole career. Shared so live
// recording and the backfill script can never disagree on the window size.
export const RECENT_PACES_WINDOW = 10;

// A pace measured over less than this is too noisy to mean anything. Shared
// so live recording and the backfill script can never disagree on the floor.
export const MIN_PACE_RACE_MINUTES = 30;

// Measured field median, in raw tokens/min per present minute (input counted).
// A debutant with no race history prices at this median.
export const FIELD_MEDIAN_PACE = 12_140;

// Mean of a horse's trailing paces, or `fallback` (typically FIELD_MEDIAN_PACE)
// for a debutant with none recorded yet.
export function recentPacePrior(paces: number[] | undefined, fallback: number): number {
  if (!paces || paces.length === 0) return fallback;
  const recent = paces.slice(-RECENT_PACES_WINDOW);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Gamma shape for a runner's remaining output, fitted out to 600 minutes.
export function shape(activeMinutes: number): number {
  if (!(activeMinutes > 0)) return 0.2;
  return Math.max(0.2, 0.032 * Math.pow(activeMinutes, 0.722));
}

// History predicts remaining output better than in-race pace does, so the race
// only takes over gradually. At the off this is pure form.
export function blendedPace(input: { observed: number; prior: number; elapsedMin: number }): number {
  const e = Math.max(0, input.elapsedMin);
  const w = e / (e + PACE_PRIOR_CROSSOVER_MIN);
  return Math.max(0, w * input.observed + (1 - w) * input.prior);
}

export type MarketRunner = {
  horse_id: string;
  name: string;
  division?: number;
  joined: boolean;
  seedKey: string;             // user_id where known, so each runner's draws are its own
  banked: number;              // scored distance already in the bank
  pace: number;                // blended raw output per minute
  projection: Float32Array;    // projectionTable for this runner
};

// One horse's win/podium prices on a race.
export type MarketPrice = {
  horse_id: string;
  joined: boolean;
  win: number;
  podium: number;
  division: number | null;         // win within your division; null when the race has no divisions
  divisionPodium: number | null;   // top three within your division; null when the race has no divisions
};

export type PriceRaceInput = {
  race_id: string;
  runners: MarketRunner[];
  attendance: AttendanceDraws;   // aligned with runners
};

export function toPrice(probability: number): number {
  return Math.min(1, Math.max(0.01, probability + MARGIN));
}

export function priceRace(input: PriceRaceInput): MarketPrice[] {
  const { race_id, runners, attendance } = input;
  const n = runners.length;
  if (n === 0) return [];
  const replays = attendance.present[0]?.length ?? 0;

  // Score streams are seeded per runner from the race id and runner key, so
  // prices move only when the race does and adding a runner reshuffles no one.
  const gammas = runners.map((r) => gammaSampler(mulberry32(hashSeed(race_id, r.seedKey, 'score'))));
  const wins = new Array<number>(n).fill(0);
  const podiums = new Array<number>(n).fill(0);
  const divWins = new Array<number>(n).fill(0);
  const divPodiums = new Array<number>(n).fill(0);
  const value = new Array<number>(n).fill(0);
  const here = new Array<boolean>(n).fill(false);

  const divisions = [...new Set(runners.map((r) => r.division).filter((d): d is number => d != null))];
  const divisionMembers = new Map<number, number[]>(
    divisions.map((d) => [d, runners.flatMap((r, i) => (r.division === d ? [i] : []))]),
  );

  for (let s = 0; s < replays; s++) {
    for (let i = 0; i < n; i++) {
      here[i] = attendance.present[i]![s] === 1;
      if (!here[i]) continue;
      const r = runners[i]!;
      const active = attendance.active[i]![s]!;
      let raw = 0;
      if (active > 0 && r.pace > 0) {
        const k = shape(active);
        raw = gammas[i]!(k) * (r.pace * active / k);
      }
      value[i] = r.banked + raw * projectedMultiplier(r.projection, active);
    }

    let winner = -1, best = -Infinity;
    for (let i = 0; i < n; i++) if (here[i] && value[i]! > best) { best = value[i]!; winner = i; }
    if (winner >= 0) wins[winner]!++;

    for (let i = 0; i < n; i++) {
      if (!here[i]) continue;
      let above = 0;
      for (let j = 0; j < n; j++) if (j !== i && here[j] && value[j]! > value[i]!) above++;
      if (above < 3) podiums[i]!++;
    }

    for (const d of divisions) {
      const idxs = divisionMembers.get(d)!;
      let bi = -1, bv = -Infinity;
      for (const i of idxs) if (here[i] && value[i]! > bv) { bv = value[i]!; bi = i; }
      if (bi >= 0) divWins[bi]!++;
      for (const i of idxs) {
        if (!here[i]) continue;
        let above = 0;
        for (const j of idxs) if (j !== i && here[j] && value[j]! > value[i]!) above++;
        if (above < 3) divPodiums[i]!++;
      }
    }
  }

  const share = (count: number) => (replays > 0 ? count / replays : 0);
  return runners.map((r, i) => ({
    horse_id: r.horse_id,
    joined: r.joined,
    win: share(wins[i]!),
    podium: share(podiums[i]!),
    division: r.division == null ? null : share(divWins[i]!),
    divisionPodium: r.division == null ? null : share(divPodiums[i]!),
  }));
}
