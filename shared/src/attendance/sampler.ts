// Draws who turns up, when they arrive and when they leave, for every replay at once.
import { GRID, BIN_MINUTES, binOf, cellIndex } from './clock.js';
import { hashSeed, mulberry32 } from '../random.js';

export type PreparedHabit = {
  login: number;
  arrivalCdf: Float64Array;   // length GRID + 1; arrival mass below each bin edge
  colCdf: Float64Array;       // GRID columns of GRID + 1; departure mass below each bin edge
};

const COL = GRID + 1;

export function prepareHabit(h: { login_propensity: number; density: Float32Array }): PreparedHabit {
  const arrivalCdf = new Float64Array(COL);
  const colCdf = new Float64Array(GRID * COL);
  for (let x = 0; x < GRID; x++) {
    let run = 0;
    for (let y = 0; y < GRID; y++) {
      colCdf[x * COL + y] = run;
      run += h.density[cellIndex(x, y)]!;
    }
    colCdf[x * COL + GRID] = run;
    arrivalCdf[x + 1] = arrivalCdf[x]! + run;
  }
  return { login: h.login_propensity, arrivalCdf, colCdf };
}

// Cumulative mass at clock minute m, linear inside a bin.
function cdfAt(cdf: Float64Array, offset: number, m: number): number {
  const pos = Math.min(GRID, Math.max(0, m / BIN_MINUTES));
  const i = Math.min(GRID - 1, Math.floor(pos));
  const lo = cdf[offset + i]!, hi = cdf[offset + i + 1]!;
  return lo + (hi - lo) * (pos - i);
}

// The clock minute where the cumulative mass reaches v.
function invert(cdf: Float64Array, offset: number, v: number): number {
  let lo = 0, hi = GRID;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[offset + mid]! <= v) lo = mid; else hi = mid;
  }
  const a = cdf[offset + lo]!, b = cdf[offset + lo + 1]!;
  const frac = b > a ? (v - a) / (b - a) : 0;
  return (lo + Math.min(1, Math.max(0, frac))) * BIN_MINUTES;
}

/** P(turns up before the finish | not here by now). Arrivals before the start count as at the start. */
export function joinRestProbability(h: PreparedHabit, now: number, finish: number): number {
  const before = cdfAt(h.arrivalCdf, 0, now);
  const rest = cdfAt(h.arrivalCdf, 0, finish) - before;
  const denom = 1 - h.login * before;
  if (!(denom > 0)) return 0;
  return Math.min(1, Math.max(0, (h.login * rest) / denom));
}

/** A departure for someone who arrived at `arrival` and was still here at `notBefore`; null if history has nothing that late. */
export function drawDeparture(h: PreparedHabit, arrival: number, notBefore: number, u: number): number | null {
  const off = binOf(arrival) * COL;
  const lo = cdfAt(h.colCdf, off, notBefore);
  const hi = h.colCdf[off + GRID]!;
  if (!(hi - lo > 1e-12)) return null;
  return Math.max(notBefore, invert(h.colCdf, off, lo + u * (hi - lo)));
}

export type SamplerPlayer =
  | { key: string; kind: 'joined'; arrival: number; lastScore: number; habit: PreparedHabit | null }
  | { key: string; kind: 'offline'; habit: PreparedHabit };

export type SamplerInput = {
  race_id: string;
  replays: number;
  now: number;
  finish: number;
  players: SamplerPlayer[];
  fallback: PreparedHabit | null;
};

export type AttendanceDraws = { present: Uint8Array[]; active: Float32Array[] };

export function sampleAttendance(input: SamplerInput): AttendanceDraws {
  const { race_id, replays, now, finish, fallback } = input;
  const present: Uint8Array[] = [];
  const active: Float32Array[] = [];

  for (const p of input.players) {
    const rnd = mulberry32(hashSeed(race_id, p.key, 'attendance'));
    const pr = new Uint8Array(replays);
    const ac = new Float32Array(replays);

    if (p.kind === 'joined') {
      const habit = p.habit ?? fallback;
      const notBefore = Math.max(p.arrival, p.lastScore);
      const from = Math.max(now, p.arrival);
      for (let r = 0; r < replays; r++) {
        const u = rnd();
        let dep = habit ? drawDeparture(habit, p.arrival, notBefore, u) : null;
        if (dep === null && fallback && habit !== fallback) dep = drawDeparture(fallback, p.arrival, notBefore, u);
        pr[r] = 1;
        ac[r] = Math.max(0, (dep === null ? finish : Math.min(finish, dep)) - from);
      }
    } else {
      const join = joinRestProbability(p.habit, now, finish);
      const aLo = cdfAt(p.habit.arrivalCdf, 0, now);
      const aHi = cdfAt(p.habit.arrivalCdf, 0, finish);
      for (let r = 0; r < replays; r++) {
        const uJoin = rnd(), uArr = rnd(), uDep = rnd();
        if (uJoin >= join || !(aHi > aLo)) continue;
        const arrival = Math.min(finish, Math.max(now, invert(p.habit.arrivalCdf, 0, aLo + uArr * (aHi - aLo))));
        const dep = drawDeparture(p.habit, arrival, arrival, uDep);
        pr[r] = 1;
        ac[r] = Math.max(0, (dep === null ? finish : Math.min(finish, dep)) - arrival);
      }
    }
    present.push(pr);
    active.push(ac);
  }
  return { present, active };
}
