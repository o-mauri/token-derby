import type { Modifier, ModifierId } from './modifier.js';
import { stamina } from './modifiers/stamina.js';

/**
 * The one place that knows which modifiers exist. The race, the settings UI and
 * the validation all read this rather than keeping lists of their own.
 */
export const MODIFIERS: Record<ModifierId, Modifier> = {
  stamina,
};

/** Every modifier, in a stable order, so a score always explains itself the same way. */
export const MODIFIER_IDS = Object.keys(MODIFIERS) as ModifierId[];
