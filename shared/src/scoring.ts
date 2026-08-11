/**
 * Scored distance. Raw tokens are the input; every token delta passes through
 * this multiplier chain before it counts toward position. With no mechanic
 * enabled the chain is empty and scored_delta === delta.
 */

import { tokenMultiplier } from './midrace.js';

export type ScoringState = {
  stamina?: number;
};

export type ScoringRace = {
  stamina?: boolean;
  counts_input?: boolean;
  stamina_config?: StaminaConfig;
};

export type ScoringTick = {
  delta: number;
  dt_ms: number;
  race: ScoringRace;
  state: ScoringState;
};

export type ScoringResult = {
  scored_delta: number;
  state: ScoringState;
};

export function scoreTick(tick: ScoringTick): ScoringResult {
  const minutes = tick.dt_ms / 60_000;
  let multiplier = 1;
  const state: ScoringState = { ...tick.state };

  if (tick.race.stamina) {
    const stamina = state.stamina ?? 100;
    if (minutes <= 0) {
      state.stamina = stamina;
    } else {
      const cfg = resolveStaminaConfig(tick.race);
      const scaled = { ...cfg, sustainable_pace: cfg.sustainable_pace * tokenMultiplier(tick.race) };
      const step = staminaStep({ stamina, pace: tick.delta / minutes, minutes, cfg: scaled });
      multiplier *= step.multiplier;
      state.stamina = step.stamina;
    }
  }

  // Round only when a mechanic is active: the flag-off path must pass the delta
  // through byte-for-byte, and real deltas are frequently fractional.
  const scored_delta = tick.race.stamina ? Math.round(tick.delta * multiplier) : tick.delta;
  return { scored_delta, state };
}

/** Scored distance for a horse, tolerating rows written before the feature. */
export function scoredOf(horse: { current_tokens: number; scored_tokens?: number }): number {
  return horse.scored_tokens ?? horse.current_tokens;
}

export const STAMINA = {
  SUSTAINABLE_PACE: 4_000,
  DRAIN_PER_MIN: 4,
  MAX_DRAIN_PER_MIN: 6,
  RECOVER_PER_MIN: 2,
  RECOVER_TICK_CAP_MS: 90_000,
  TAPER_FLOOR: 25,
  TIRED_MULTIPLIER: 0.5,
} as const;

export type StaminaConfig = Partial<{
  sustainable_pace: number;
  drain_per_min: number;
  max_drain_per_min: number;
  recover_per_min: number;
  taper_floor: number;
  tired_multiplier: number;
}>;

export type ResolvedStaminaConfig = Required<StaminaConfig>;

export function resolveStaminaConfig(race: { stamina_config?: StaminaConfig }): ResolvedStaminaConfig {
  const c = race.stamina_config ?? {};
  return {
    sustainable_pace: c.sustainable_pace ?? STAMINA.SUSTAINABLE_PACE,
    drain_per_min: c.drain_per_min ?? STAMINA.DRAIN_PER_MIN,
    max_drain_per_min: c.max_drain_per_min ?? STAMINA.MAX_DRAIN_PER_MIN,
    recover_per_min: c.recover_per_min ?? STAMINA.RECOVER_PER_MIN,
    taper_floor: c.taper_floor ?? STAMINA.TAPER_FLOOR,
    tired_multiplier: c.tired_multiplier ?? STAMINA.TIRED_MULTIPLIER,
  };
}

export const STAMINA_PARAM_BOUNDS = {
  sustainable_pace:  { min: 1_000, max: 20_000, step: 250,  default: STAMINA.SUSTAINABLE_PACE },
  drain_per_min:     { min: 1,     max: 12,     step: 1,    default: STAMINA.DRAIN_PER_MIN },
  max_drain_per_min: { min: 2,     max: 20,     step: 1,    default: STAMINA.MAX_DRAIN_PER_MIN },
  recover_per_min:   { min: 1,     max: 8,      step: 1,    default: STAMINA.RECOVER_PER_MIN },
  taper_floor:       { min: 10,    max: 60,     step: 5,    default: STAMINA.TAPER_FLOOR },
  tired_multiplier:  { min: 0.2,   max: 0.9,    step: 0.05, default: STAMINA.TIRED_MULTIPLIER },
} as const;

export type StaminaParamKey = keyof typeof STAMINA_PARAM_BOUNDS;

export type ValidationResult =
  | { ok: true; value: StaminaConfig }
  | { ok: false; message: string };

export function validateStaminaConfig(input: StaminaConfig): ValidationResult {
  const out: StaminaConfig = {};
  for (const [key, raw] of Object.entries(input)) {
    // Object.hasOwn, NOT a truthy check on the indexed value: indexing with an
    // inherited name like "hasOwnProperty" returns a function, so `!bound` would
    // not fire and the range check below would compare against undefined.
    if (!Object.hasOwn(STAMINA_PARAM_BOUNDS, key)) {
      return { ok: false, message: `Unknown stamina setting "${key}"` };
    }
    const bound = STAMINA_PARAM_BOUNDS[key as StaminaParamKey];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, message: `${key} must be a number` };
    }
    if (raw < bound.min || raw > bound.max) {
      return { ok: false, message: `${key} must be between ${bound.min} and ${bound.max}` };
    }
    out[key as StaminaParamKey] = raw;
  }
  return { ok: true, value: out };
}

export type StaminaStepInput = {
  stamina: number;
  pace: number;
  minutes: number;
  cfg: ResolvedStaminaConfig;
};

/**
 * One tick of the stamina model. `multiplier` is computed from the stamina the
 * horse had while producing the tick; `stamina` is the advanced value.
 */
export function staminaStep(input: StaminaStepInput): { multiplier: number; stamina: number } {
  const { stamina, pace, minutes, cfg } = input;
  const floor = cfg.taper_floor;

  const multiplier = stamina >= floor
    ? 1
    : cfg.tired_multiplier + (1 - cfg.tired_multiplier) * (stamina / floor);

  let next = stamina;
  if (pace > cfg.sustainable_pace) {
    const perMin = Math.min((pace / cfg.sustainable_pace - 1) * cfg.drain_per_min, cfg.max_drain_per_min);
    next -= perMin * minutes;
  } else {
    const creditMin = Math.min(minutes, STAMINA.RECOVER_TICK_CAP_MS / 60_000);
    next += cfg.recover_per_min * creditMin;
  }

  return { multiplier, stamina: Math.max(0, Math.min(100, next)) };
}
