/**
 * Scored distance: raw tokens in, distance out.
 *
 * The mechanics themselves live in scoring/modifiers/; this file is the entry
 * point the race calls, plus the generic configuration surface the settings UI
 * and the API read. Nothing here names a mechanic except where a caller is
 * genuinely about one -- see the stamina display surface at the bottom.
 */

import type { ModelFamily, ModifierId, ModifierSettings, ModifierStates } from './types.js';
import { MODIFIERS, MODIFIER_IDS } from './scoring/registry.js';
import {
  resolveParams,
  validateParams,
  type ScoringHorse,
  type ValidationResult,
} from './scoring/modifier.js';
import { runModifiers, type ActiveModifier } from './scoring/engine.js';
import {
  FULL_STAMINA,
  STATE_KEY,
  type StaminaParamKey,
  type StaminaParams,
} from './scoring/modifiers/stamina.js';

export type ScoringRace = {
  modifiers?: ModifierSettings;
  // Pre-`modifiers` spelling, read for races already running when it changed.
  stamina?: boolean;
  stamina_config?: StaminaConfig;
};

export type ScoringTick = {
  delta: number;
  dt_ms: number;
  race: ScoringRace;
  /** Every modifier's state as of the previous beat. Empty on a horse's first. */
  modifier_states: ModifierStates;
  /**
   * The delta split by the family that produced it. REQUIRED, and must sum to
   * `delta`: a per-family modifier scores from this, so a zeroed or partial
   * split would silently score nothing.
   */
  components: Record<ModelFamily, number>;
  now_ms?: number;
  horse?: ScoringHorse;
  field?: readonly ScoringHorse[];
};

export type ScoringResult = {
  scored_delta: number;
  /** Each modifier's state after the beat. Store this back on the horse. */
  modifier_states: ModifierStates;
  /** What each modifier contributed this beat, in registry order. */
  attribution: Array<{ id: ModifierId; multiplier: number }>;
};

/**
 * Scored distance for one beat.
 *
 * Resolves which modifiers the race runs, hands them the beat, and returns
 * their state for the caller to store back on the horse. A modifier the race is
 * not running keeps whatever state it had, so turning one off mid-race and back
 * on does not silently reset it.
 */
export function scoreTick(tick: ScoringTick): ScoringResult {
  const active = modifiersForRace(tick.race, tick.modifier_states);
  const result = runModifiers(active, {
    delta: tick.delta,
    components: tick.components,
    dt_ms: tick.dt_ms,
    now_ms: tick.now_ms ?? 0,
    horse: tick.horse ?? { horse_id: '', current_tokens: 0, joined_at: '' },
    field: tick.field ?? [],
  });

  return {
    scored_delta: result.scored_delta,
    modifier_states: { ...tick.modifier_states, ...result.modifier_states },
    attribution: result.attribution,
  };
}

/**
 * Which modifiers a race is running, and with what tuning. Reads the registry
 * rather than any list of its own, so a newly registered mechanic is reachable
 * the moment a race switches it on.
 *
 * A modifier starts from an empty bag; each one owns the numbers it falls back
 * to, so nothing here needs to know a mechanic's initial state.
 */
function modifiersForRace(race: ScoringRace, states: ModifierStates): ActiveModifier[] {
  const active: ActiveModifier[] = [];
  for (const id of MODIFIER_IDS) {
    const modifier = MODIFIERS[id];
    const setting = settingFor(race, id);
    if (!runsModifier(race, id)) continue;
    active.push({
      modifier,
      params: resolveParams(modifier, setting?.params ?? {}),
      state: states[id] ?? {},
    });
  }
  return active;
}

/**
 * One modifier's configuration for a race.
 *
 * Races created before `modifiers` carry a stamina flag and a separate config
 * snapshot instead. Reading those keeps a race that is mid-flight scoring the
 * way it started -- without it, a deploy would switch the mechanic off under a
 * running race.
 */
function settingFor(race: ScoringRace, id: ModifierId) {
  if (race.modifiers) return race.modifiers[id];
  if (id !== 'stamina') return undefined;
  return race.stamina ? { enabled: true, params: race.stamina_config ?? {} } : { enabled: false };
}

/**
 * A horse's stamina reserve, for display. A horse with no stamina state yet --
 * a fresh joiner, or any horse in a race not running the mechanic -- reads full.
 */
export function staminaOf(horse: { modifier_states?: ModifierStates }): number {
  return horse.modifier_states?.stamina?.[STATE_KEY] ?? FULL_STAMINA;
}

/** Scored distance for a horse, tolerating rows written before the feature. */
export function scoredOf(horse: { current_tokens: number; scored_tokens?: number }): number {
  return horse.scored_tokens ?? horse.current_tokens;
}

// ─── Modifier configuration ──────────────────────────────────────────────────

/**
 * Whether a race runs a mechanic. The UI surfaces that draw a mechanic ask this
 * rather than testing a configuration field themselves -- a race configured
 * through the settings map and one carrying the pre-map flag must both answer
 * the same, and only `settingFor` knows how to read either.
 */
export function runsModifier(race: ScoringRace, id: ModifierId): boolean {
  return settingFor(race, id)?.enabled ?? MODIFIERS[id].enabledByDefault;
}

/**
 * A modifier's resolved tuning for a race: the race's overrides on top of the
 * modifier's own defaults. Callers that render a mechanic's UI -- the stamina
 * bar's bands, say -- read the numbers the server is actually scoring with.
 */
export function resolveModifierParams(race: ScoringRace, id: ModifierId): Record<string, number> {
  return resolveParams(MODIFIERS[id], settingFor(race, id)?.params ?? {});
}

/**
 * Check submitted configuration for every modifier it names. An unknown
 * modifier id is rejected rather than stored and silently ignored, since a
 * typo would otherwise read as a mechanic that is simply switched off.
 */
export function validateModifierSettings(input: Readonly<Record<string, unknown>>): ModifierSettingsValidation {
  const out: ModifierSettings = {};
  for (const [id, raw] of Object.entries(input)) {
    if (!Object.hasOwn(MODIFIERS, id)) {
      return { ok: false, message: `Unknown mechanic "${id}"` };
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, message: `${id} must be an object` };
    }
    const setting = raw as { enabled?: unknown; params?: unknown };
    if (typeof setting.enabled !== 'boolean') {
      return { ok: false, message: `${id}.enabled must be true or false` };
    }
    if (setting.params !== undefined &&
        (typeof setting.params !== 'object' || setting.params === null || Array.isArray(setting.params))) {
      return { ok: false, message: `${id}.params must be an object` };
    }
    const params = validateParams(MODIFIERS[id as ModifierId], (setting.params ?? {}) as Record<string, unknown>);
    if (!params.ok) return params;
    out[id as ModifierId] = {
      enabled: setting.enabled,
      ...(Object.keys(params.value).length > 0 ? { params: params.value } : {}),
    };
  }
  return { ok: true, value: out };
}

export type ModifierSettingsValidation =
  | { ok: true; value: ModifierSettings }
  | { ok: false; message: string };

// ─── Stamina display surface ─────────────────────────────────────────────────
// The stamina bar is stamina's own UI, so its callers name the mechanic. The
// mechanism underneath is generic; only the id is spelled out.

export type StaminaConfig = Partial<StaminaParams>;
export type ResolvedStaminaConfig = StaminaParams;
export type { StaminaParamKey, ValidationResult };

/** The stamina tuning a race is scoring with, for the bar's bands. */
export function resolveStaminaConfig(race: ScoringRace): ResolvedStaminaConfig {
  return resolveModifierParams(race, 'stamina') as ResolvedStaminaConfig;
}
