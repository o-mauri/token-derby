import type { ModifierId, ModifierSetting, ModifierSettings, RaceSettings, SetOrgRaceSettingsRequest } from '@token-derby/shared';
import { MODIFIERS, MODIFIER_IDS } from '@token-derby/shared';

/** The org's stored modifiers, reading the older stamina-only shape when that's all the row has. */
export function storedModifiers(s: RaceSettings | null): ModifierSettings {
  if (s?.modifiers) return s.modifiers;
  if (s?.stamina_config) return { stamina: { enabled: false, params: s.stamina_config as unknown as Record<string, number> } };
  return {};
}

/** What to save: a modifier that's off and untuned is left out, and only settings that differ from their defaults are sent. */
export function persistRequest(current: Partial<Record<ModifierId, ModifierSetting>>): SetOrgRaceSettingsRequest {
  const modifiers: ModifierSettings = {};
  for (const id of MODIFIER_IDS) {
    const setting = current[id];
    if (!setting) continue;
    const params: Record<string, number> = {};
    for (const [key, bound] of Object.entries(MODIFIERS[id].params)) {
      const v = setting.params?.[key];
      if (typeof v === 'number' && Math.abs(v - bound.default) > 1e-9) params[key] = v;
    }
    const tuned = Object.keys(params).length > 0;
    if (!setting.enabled && !tuned) continue;
    modifiers[id] = { enabled: setting.enabled, ...(tuned ? { params } : {}) };
  }
  return Object.keys(modifiers).length > 0 ? { modifiers } : {};
}
