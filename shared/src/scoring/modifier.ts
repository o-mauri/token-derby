// The contract every scoring modifier implements.
//
// A MODIFIER turns raw tokens into scored distance. It sees the beat and
// returns a MULTIPLIER -- never a value -- which is what keeps the pipeline
// order-independent: every modifier reads the same delta, and multipliers
// commute. That also means there is no modifier order to configure, and no
// argument about whether stamina applies before or after anything else.
//
// Adding one is three steps and touches nothing else:
//   1. write scoring/modifiers/<id>.ts exporting one Modifier
//   2. add one line to scoring/registry.ts
//   3. add its id to ModifierId
// The engine owns the fold, the guards, the rounding and the state merge, and
// cannot be bypassed.

import type { ModelFamily } from '../types.js';

export type ModifierId = 'stamina';

/** A tunable number, with the bounds the admin UI renders it within. */
export type ParamBound = {
  min: number;
  max: number;
  step: number;
  default: number;
};

/** A modifier's own persisted numbers, carried between beats. */
export type ModifierState = Record<string, number>;

/** Just enough of a horse for a modifier to reason about the field. */
export type ScoringHorse = {
  horse_id: string;
  current_tokens: number;
  scored_tokens?: number;
  joined_at: string;
};

export type ModifierContext = {
  /** The beat's tokens. Every modifier sees the same value. */
  delta: number;
  /** That delta split by the family that produced it. */
  components: Readonly<Record<ModelFamily, number>>;
  /** Gap since this horse's previous accepted beat. Server-measured. */
  dt_ms: number;
  /** One instant for the whole beat, so nothing downstream disagrees. */
  now_ms: number;
  /** The horse being scored, as it was BEFORE this beat. */
  horse: ScoringHorse;
  /** The field as it was before this beat -- ranks lag by one beat by design. */
  field: readonly ScoringHorse[];
  /** Resolved tuning: race overrides on top of this modifier's defaults. */
  params: Readonly<Record<string, number>>;
  /** This modifier's own state bag. Never another modifier's. */
  state: Readonly<ModifierState>;
};

export type ModifierOutcome = {
  /** 1 leaves the beat untouched. Below 1 slows the horse, above 1 speeds it. */
  multiplier: number;
  /** Replaces this modifier's state bag. Omit to leave it unchanged. */
  state?: ModifierState;
};

export interface Modifier {
  readonly id: ModifierId;
  /** How the mechanic is named to players and admins. */
  readonly label: string;
  /** One line explaining what it does, for the settings UI. */
  readonly description: string;
  /**
   * Whether a race runs this unless told otherwise. New mechanics ship off:
   * turning one on should be a decision, never a surprise mid-season.
   */
  readonly enabledByDefault: boolean;
  /** Tunable numbers, their bounds and defaults. Drives the admin sliders. */
  readonly params: Record<string, ParamBound>;

  apply(ctx: ModifierContext): ModifierOutcome;

  /**
   * Optional plain-language consequences of a given tuning, for the settings
   * preview. Implemented by calling `apply`, so the preview cannot drift from
   * what the server actually does.
   */
  preview?(params: Readonly<Record<string, number>>): Array<{ label: string; value: string }>;
}

/** Resolve a modifier's tuning: race overrides on top of its own defaults. */
export function resolveParams(
  modifier: Modifier,
  overrides: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, bound] of Object.entries(modifier.params)) {
    const value = overrides[key];
    out[key] = typeof value === 'number' && Number.isFinite(value) ? value : bound.default;
  }
  return out;
}

export type ValidationResult =
  | { ok: true; value: Record<string, number> }
  | { ok: false; message: string };

/** Check submitted tuning against a modifier's bounds. */
export function validateParams(
  modifier: Modifier,
  input: Readonly<Record<string, unknown>>,
): ValidationResult {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    // Object.hasOwn, NOT a truthy check on the indexed value: indexing with an
    // inherited name like "hasOwnProperty" returns a function, so `!bound` would
    // not fire and the range check below would compare against undefined.
    if (!Object.hasOwn(modifier.params, key)) {
      return { ok: false, message: `Unknown ${modifier.label} setting "${key}"` };
    }
    const bound = modifier.params[key]!;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, message: `${key} must be a number` };
    }
    if (raw < bound.min || raw > bound.max) {
      return { ok: false, message: `${key} must be between ${bound.min} and ${bound.max}` };
    }
    out[key] = raw;
  }
  return { ok: true, value: out };
}
