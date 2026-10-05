import type { StaminaBand } from '../models';

export const STAMINA_BAR_PX = 38;

/** High above half, mid down to the race's taper floor (where scoring starts costing), low below it. */
export function staminaBand(value: number, taperFloor: number): StaminaBand {
  return value > 50 ? 'high' : value >= taperFloor ? 'mid' : 'low';
}

/** Bar fill in px: a 2px minimum while alive, or a near-empty horse reads as already dead. */
export function staminaFillPx(value: number): number {
  return value <= 0 ? 0 : Math.max(2, Math.round((STAMINA_BAR_PX * value) / 100));
}
