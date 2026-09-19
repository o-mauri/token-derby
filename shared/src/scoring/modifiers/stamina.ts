// Stamina: a horse running above a sustainable pace tires, and scores less
// until it recovers. The multiplier comes from the stamina the horse HAD while
// producing the beat; the drain from that same beat is only felt on the next
// one, so a horse is never charged for work it has not done yet.

import type { Modifier, ModifierContext, ModifierOutcome, ParamBound } from '../modifier.js';

/** The value a horse starts a race with, and its ceiling. */
export const FULL_STAMINA = 100;

/**
 * Recovery credited for one beat is capped, so a long absence earns the same
 * rest as an ordinary gap. Closing your laptop is not a rest strategy.
 */
export const RECOVER_TICK_CAP_MS = 90_000;

/** The single number this modifier persists between beats. */
export const STATE_KEY = 'level';

const PARAMS = {
  sustainable_pace:  { min: 10_000, max: 200_000, step: 2_500, default: 40_000 },
  drain_per_min:     { min: 1,      max: 12,      step: 1,     default: 4 },
  max_drain_per_min: { min: 2,      max: 20,      step: 1,     default: 6 },
  recover_per_min:   { min: 1,      max: 8,       step: 1,     default: 2 },
  taper_floor:       { min: 10,     max: 60,      step: 5,     default: 25 },
  tired_multiplier:  { min: 0.2,    max: 0.9,     step: 0.05,  default: 0.5 },
} satisfies Record<string, ParamBound>;

export type StaminaParamKey = keyof typeof PARAMS;

const fmt = (n: number) => Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

export const stamina: Modifier = {
  id: 'stamina',
  label: 'Stamina',
  description: 'Horses running above a sustainable pace tire and score less until they recover.',
  enabledByDefault: false,
  params: PARAMS,

  apply(ctx: ModifierContext): ModifierOutcome {
    const level = ctx.state[STATE_KEY] ?? FULL_STAMINA;
    const minutes = ctx.dt_ms / 60_000;
    // No elapsed time means no pace to judge and nothing to recover from.
    if (minutes <= 0) return { multiplier: 1, state: { [STATE_KEY]: level } };

    const step = staminaStep({ level, pace: ctx.delta / minutes, minutes, params: ctx.params as unknown as StaminaParams });
    return { multiplier: step.multiplier, state: { [STATE_KEY]: step.level } };
  },

  preview(params) {
    const p = params as unknown as StaminaParams;
    // Probing at exactly 2x sustainable_pace makes the uncapped drain term equal
    // drain_per_min itself -- never zero, never dependent on the pace's absolute
    // size -- so this stays meaningful for every sustainable_pace on the slider.
    const drained = staminaStep({ level: FULL_STAMINA, pace: p.sustainable_pace * 2, minutes: 1, params: p });
    const perMin = FULL_STAMINA - drained.level;
    const spent = staminaStep({ level: 0, pace: 0, minutes: 1, params: p });
    return [
      { label: 'Draining begins above', value: `${fmt(p.sustainable_pace)} tokens/min` },
      { label: 'At twice that pace, full stamina reaches the floor in', value: `${fmt((FULL_STAMINA - p.taper_floor) / perMin)} min` },
      { label: 'A fully spent horse scores at', value: `${fmt(spent.multiplier * 100)}%` },
      { label: 'Empty to full takes', value: `${fmt(FULL_STAMINA / spent.level)} min` },
    ];
  },
};

export type StaminaParams = Record<StaminaParamKey, number>;

/**
 * One tick of the stamina model, exported so the settings preview and the tests
 * exercise the same arithmetic the race does.
 *
 * `multiplier` is computed from the stamina the horse had while producing the
 * beat; `level` is the advanced value.
 */
export function staminaStep(input: {
  level: number;
  pace: number;
  minutes: number;
  params: StaminaParams;
}): { multiplier: number; level: number } {
  const { level, pace, minutes, params } = input;

  const multiplier = level >= params.taper_floor
    ? 1
    : params.tired_multiplier + (1 - params.tired_multiplier) * (level / params.taper_floor);

  let next = level;
  if (pace > params.sustainable_pace) {
    const perMin = Math.min(
      (pace / params.sustainable_pace - 1) * params.drain_per_min,
      params.max_drain_per_min,
    );
    next -= perMin * minutes;
  } else {
    const credited = Math.min(minutes, RECOVER_TICK_CAP_MS / 60_000);
    next += params.recover_per_min * credited;
  }

  return { multiplier, level: Math.max(0, Math.min(FULL_STAMINA, next)) };
}
