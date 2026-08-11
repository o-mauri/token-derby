// The odds model. Pure arithmetic — no I/O, no clock, no randomness that
// isn't seeded. Every constant here was fitted against real races; see the
// design doc before changing any of them.

export const PACE_PRIOR_CROSSOVER_MIN = 120;
export const PHANTOM_SCALE = 0.70;
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

// Measured field median, in output-equivalent tokens/min. A debutant with no
// race history prices as a phantom that turned up.
export const FIELD_MEDIAN_PACE = 1214;

// Mean of a horse's trailing paces, or `fallback` (typically FIELD_MEDIAN_PACE)
// for a debutant with none recorded yet.
export function recentPacePrior(paces: number[] | undefined, fallback: number): number {
  if (!paces || paces.length === 0) return fallback;
  const recent = paces.slice(-RECENT_PACES_WINDOW);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Gamma shape for remaining production, fitted out to 600 minutes. Rises with
// time left because a longer run-in averages the burstiness out.
export function shape(minutesRemaining: number): number {
  if (!(minutesRemaining > 0)) return 0.2;
  return Math.max(0.2, 0.032 * Math.pow(minutesRemaining, 0.722));
}

// History predicts remaining output better than in-race pace does, so the race
// only takes over gradually. At the off this is pure form.
export function blendedPace(input: { observed: number; prior: number; elapsedMin: number }): number {
  const e = Math.max(0, input.elapsedMin);
  const w = e / (e + PACE_PRIOR_CROSSOVER_MIN);
  return Math.max(0, w * input.observed + (1 - w) * input.prior);
}

// Fraction of the final field expected to have joined by now. Larger fields
// fill markedly slower, so the curve is picked by expected field size.
const JOIN_CURVES: Record<'small' | 'mid' | 'large', Array<[number, number]>> = {
  small: [[0, 0], [0.05, 0.60], [0.10, 0.83], [0.15, 1.0], [1, 1]],
  mid:   [[0, 0], [0.05, 0.56], [0.10, 0.75], [0.15, 0.75], [0.20, 0.88], [0.30, 0.90], [0.40, 1.0], [1, 1]],
  large: [[0, 0], [0.05, 0.15], [0.10, 0.27], [0.15, 0.38], [0.20, 0.46], [0.30, 0.80], [0.40, 0.92], [0.50, 1.0], [1, 1]],
};

export function joinedFractionByNow(elapsedFraction: number, expectedField: number): number {
  if (!(elapsedFraction > 0)) return 0;
  if (elapsedFraction >= 1) return 1;
  const curve = expectedField <= 6 ? JOIN_CURVES.small
    : expectedField <= 10 ? JOIN_CURVES.mid
    : JOIN_CURVES.large;
  for (let i = 0; i < curve.length - 1; i++) {
    const [a, fa] = curve[i]!;
    const [b, fb] = curve[i + 1]!;
    if (elapsedFraction >= a && elapsedFraction <= b) {
      return b > a ? fa + (fb - fa) * ((elapsedFraction - a) / (b - a)) : fb;
    }
  }
  return 1;
}

// Runners who have not joined yet. They compete in the simulation but have no
// market: without them an early leader prices as a certainty and every share
// sold is free money once the field fills.
export function phantomCount(input: { elapsedFraction: number; expectedField: number }): number {
  const missing = 1 - joinedFractionByNow(input.elapsedFraction, input.expectedField);
  return Math.max(0, Math.round(missing * input.expectedField * PHANTOM_SCALE));
}

export type MarketRunner = {
  horse_id: string;
  name: string;
  division?: number;
  banked: number;          // scored tokens already in the bank — a fact, not a forecast
  pace: number;            // blended pace, in this race's token units per minute
};

// One horse's win/podium prices on a race.
export type MarketPrice = {
  horse_id: string;
  win: number;
  podium: number;
  division: number | null;         // win within your division; null when the race has no divisions
  divisionPodium: number | null;   // top three within your division; null when the race has no divisions
};

export type PriceRaceInput = {
  race_id: string;
  runners: MarketRunner[];
  minutesRemaining: number;
  phantoms: number;
  phantomPacePool: number[];   // empirical priors, this race's token units per minute
  maxRemainingPerRunner: number;
};

// Seeded from the race id alone. Consecutive recomputes share their draws, so
// prices move only when the race moves rather than twitching on fresh noise.
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Marsaglia-Tsang. Gamma rather than normal because production is
// non-negative and right-skewed.
function gammaSampler(rnd: () => number): (k: number) => number {
  const normal = (): number => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const draw = (k: number): number => {
    if (k < 1) return draw(1 + k) * Math.pow(rnd(), 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0, v = 0;
      do { x = normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rnd();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  return draw;
}

export function toPrice(probability: number): number {
  return Math.min(1, Math.max(0.01, probability + MARGIN));
}

// Arithmetic certainty, not just statistical: when the leader's lead already
// exceeds everything the field could still produce, the race is decided.
function decidedWinner(runners: MarketRunner[], maxRemaining: number): number | null {
  if (runners.length < 2) return null;
  let best = 0;
  for (let i = 1; i < runners.length; i++) {
    if (runners[i]!.banked > runners[best]!.banked) best = i;
  }
  for (let i = 0; i < runners.length; i++) {
    if (i === best) continue;
    if (runners[i]!.banked + maxRemaining >= runners[best]!.banked) return null;
  }
  return best;
}

export function priceRace(input: PriceRaceInput): MarketPrice[] {
  const { runners, minutesRemaining, phantoms, phantomPacePool, maxRemainingPerRunner } = input;
  const n = runners.length;
  if (n === 0) return [];

  // Arithmetic certainty applies to the win market only: the leader cannot be
  // caught, but second and third are still open and must come from the field.
  const decided = phantoms === 0 ? decidedWinner(runners, maxRemainingPerRunner) : null;

  const rnd = mulberry32(seedFrom(input.race_id));
  const gamma = gammaSampler(rnd);
  const k = shape(minutesRemaining);
  const theta = runners.map((r) => Math.max(0, r.pace) * minutesRemaining / k);
  const pool = phantomPacePool.length ? phantomPacePool : [0];

  const wins = new Array<number>(n).fill(0);
  const podiums = new Array<number>(n).fill(0);
  const divWins = new Array<number>(n).fill(0);
  const divPodiums = new Array<number>(n).fill(0);
  const value = new Array<number>(n).fill(0);
  const phantomVals: number[] = [];

  const divisions = [...new Set(runners.map((r) => r.division).filter((d): d is number => d != null))];
  // Precomputed once — division membership doesn't change between draws.
  const divisionMembers = new Map<number, number[]>(
    divisions.map((d) => [d, runners.flatMap((r, i) => (r.division === d ? [i] : []))]),
  );

  for (let s = 0; s < SIMULATIONS; s++) {
    for (let i = 0; i < n; i++) {
      value[i] = runners[i]!.banked + (theta[i]! > 0 ? gamma(k) * theta[i]! : 0);
    }
    // Phantoms compete but hold no market and belong to no division. Keep
    // every draw rather than only the best — several can finish ahead of a
    // runner at once, and collapsing them to a max would overstate podium.
    phantomVals.length = 0;
    for (let p = 0; p < phantoms; p++) {
      const pace = pool[Math.floor(rnd() * pool.length)] ?? 0;
      phantomVals.push(pace > 0 ? gamma(k) * (pace * minutesRemaining / k) : 0);
    }

    let winner = -1, winnerVal = -Infinity;
    for (const v of phantomVals) if (v > winnerVal) winnerVal = v;
    for (let i = 0; i < n; i++) if (value[i]! > winnerVal) { winnerVal = value[i]!; winner = i; }
    if (winner >= 0) wins[winner]!++;   // stays -1 when a phantom wins

    // A runner places if fewer than three rivals beat it, phantoms included.
    for (let i = 0; i < n; i++) {
      let above = 0;
      for (const v of phantomVals) if (v > value[i]!) above++;
      for (let j = 0; j < n; j++) if (j !== i && value[j]! > value[i]!) above++;
      if (above < 3) podiums[i]!++;
    }

    // Division markets ignore phantoms and every other division — only your
    // own division-mates are rivals, so a division of 3 or fewer always
    // places everyone (at most 2 rivals can ever be "above").
    for (const d of divisions) {
      const idxs = divisionMembers.get(d)!;
      let bi = -1, bv = -Infinity;
      for (const i of idxs) if (value[i]! > bv) { bv = value[i]!; bi = i; }
      if (bi >= 0) divWins[bi]!++;

      for (const i of idxs) {
        let above = 0;
        for (const j of idxs) if (j !== i && value[j]! > value[i]!) above++;
        if (above < 3) divPodiums[i]!++;
      }
    }
  }

  return runners.map((r, i) => ({
    horse_id: r.horse_id,
    win: decided !== null ? (i === decided ? 1 : 0) : wins[i]! / SIMULATIONS,
    podium: podiums[i]! / SIMULATIONS,
    division: r.division == null ? null : divWins[i]! / SIMULATIONS,
    divisionPodium: r.division == null ? null : divPodiums[i]! / SIMULATIONS,
  }));
}
