/**
 * Scored distance: raw tokens in, distance out.
 *
 * The mechanics themselves live in scoring/modifiers/; this file is the entry
 * point the race calls, plus the small compatibility surface the settings UI
 * and the API still use. Stamina's own numbers are the modifier's -- nothing
 * here re-implements them.
 */

import { zeroPerFamily } from './models.js';
import type { ModelFamily } from './types.js';
import { MODIFIERS } from './scoring/registry.js';
import {
  resolveParams,
  validateParams,
  type ModifierId,
  type ScoringHorse,
  type ValidationResult,
} from './scoring/modifier.js';
import { runModifiers, type ActiveModifier } from './scoring/engine.js';
import {
  FULL_STAMINA,
  STATE_KEY,
  staminaStep as staminaModifierStep,
  type StaminaParamKey,
  type StaminaParams,
} from './scoring/modifiers/stamina.js';

export type ScoringState = {
  stamina?: number;
};

export type ScoringRace = {
  stamina?: boolean;
  stamina_config?: StaminaConfig;
};

export type ScoringTick = {
  delta: number;
  dt_ms: number;
  race: ScoringRace;
  state: ScoringState;
  // Optional until every caller supplies them: a modifier that reads the field
  // or the per-family split needs them, and stamina does not.
  components?: Record<ModelFamily, number>;
  now_ms?: number;
  horse?: ScoringHorse;
  field?: readonly ScoringHorse[];
};

export type ScoringResult = {
  scored_delta: number;
  state: ScoringState;
  /** What each modifier contributed this beat, in registry order. */
  attribution: Array<{ id: ModifierId; multiplier: number }>;
};

/**
 * Scored distance for one beat.
 *
 * A thin shim over the pipeline: it resolves which modifiers the race runs,
 * hands them the beat, and maps the result back onto the flat stamina field the
 * horse row still carries. Per-race modifier config and a generic state map come
 * next; keeping this signature meant the pipeline could be proven to produce
 * identical numbers first.
 */
export function scoreTick(tick: ScoringTick): ScoringResult {
  const active = modifiersForRace(tick.race, tick.state);
  const result = runModifiers(active, {
    delta: tick.delta,
    components: tick.components ?? zeroPerFamily(),
    dt_ms: tick.dt_ms,
    now_ms: tick.now_ms ?? 0,
    horse: tick.horse ?? { horse_id: '', current_tokens: 0, joined_at: '' },
    field: tick.field ?? [],
  });

  const level = result.state.stamina?.[STATE_KEY];
  return {
    scored_delta: result.scored_delta,
    state: level === undefined ? { ...tick.state } : { stamina: level },
    attribution: result.attribution,
  };
}

/**
 * Which modifiers a race is running. Still reads the per-race stamina flag and
 * its config snapshot, so this step changes no stored shape.
 */
function modifiersForRace(race: ScoringRace, state: ScoringState): ActiveModifier[] {
  if (!race.stamina) return [];
  return [{
    modifier: MODIFIERS.stamina,
    params: resolveParams(MODIFIERS.stamina, race.stamina_config ?? {}),
    state: { [STATE_KEY]: state.stamina ?? FULL_STAMINA },
  }];
}

/** Scored distance for a horse, tolerating rows written before the feature. */
export function scoredOf(horse: { current_tokens: number; scored_tokens?: number }): number {
  return horse.scored_tokens ?? horse.current_tokens;
}

// ─── Stamina compatibility surface ───────────────────────────────────────────
// The settings UI and the API still speak in stamina_config. These adapt to the
// modifier rather than restating its numbers, so there is one source of truth.

export type StaminaConfig = Partial<StaminaParams>;
export type ResolvedStaminaConfig = StaminaParams;
export type { StaminaParamKey, ValidationResult };

export const STAMINA_PARAM_BOUNDS = MODIFIERS.stamina.params as Record<StaminaParamKey, {
  min: number; max: number; step: number; default: number;
}>;

export const STAMINA = {
  SUSTAINABLE_PACE: STAMINA_PARAM_BOUNDS.sustainable_pace.default,
  DRAIN_PER_MIN: STAMINA_PARAM_BOUNDS.drain_per_min.default,
  MAX_DRAIN_PER_MIN: STAMINA_PARAM_BOUNDS.max_drain_per_min.default,
  RECOVER_PER_MIN: STAMINA_PARAM_BOUNDS.recover_per_min.default,
  RECOVER_TICK_CAP_MS: 90_000,
  TAPER_FLOOR: STAMINA_PARAM_BOUNDS.taper_floor.default,
  TIRED_MULTIPLIER: STAMINA_PARAM_BOUNDS.tired_multiplier.default,
} as const;

export function resolveStaminaConfig(race: { stamina_config?: StaminaConfig }): ResolvedStaminaConfig {
  return resolveParams(MODIFIERS.stamina, race.stamina_config ?? {}) as ResolvedStaminaConfig;
}

export function validateStaminaConfig(input: StaminaConfig): ValidationResult {
  return validateParams(MODIFIERS.stamina, input as Record<string, unknown>);
}

export type StaminaStepInput = {
  stamina: number;
  pace: number;
  minutes: number;
  cfg: ResolvedStaminaConfig;
};

/** One tick of the stamina model, in the shape the settings preview expects. */
export function staminaStep(input: StaminaStepInput): { multiplier: number; stamina: number } {
  const step = staminaModifierStep({
    level: input.stamina,
    pace: input.pace,
    minutes: input.minutes,
    params: input.cfg,
  });
  return { multiplier: step.multiplier, stamina: step.level };
}
