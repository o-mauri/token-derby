import { MODIFIERS, type ModifierSetting } from '@token-derby/shared';
import { persistRequest, storedModifiers } from './race-settings-model';

const defaults = () => Object.fromEntries(Object.entries(MODIFIERS.stamina.params).map(([k, b]) => [k, b.default]));
const key = Object.keys(MODIFIERS.stamina.params)[0]!;

describe('race settings model', () => {
  it('sends nothing for a modifier that is off and untouched', () => {
    expect(persistRequest({ stamina: { enabled: false, params: defaults() } } as Record<'stamina', ModifierSetting>)).toEqual({});
  });

  it('sends just the switch for a modifier on at its defaults', () => {
    expect(persistRequest({ stamina: { enabled: true, params: defaults() } } as Record<'stamina', ModifierSetting>)).toEqual({ modifiers: { stamina: { enabled: true } } });
  });

  it('sends only the settings that differ from the defaults', () => {
    const params = { ...defaults(), [key]: defaults()[key]! + 1 };
    expect(persistRequest({ stamina: { enabled: true, params } } as Record<'stamina', ModifierSetting>))
      .toEqual({ modifiers: { stamina: { enabled: true, params: { [key]: params[key] } } } });
  });

  it('reads the old stamina-only shape', () => {
    expect(storedModifiers({ org_id: 'o', stamina_config: { sustainable_pace: 1 } as never, updated_at: '', updated_by_user_id: '' }))
      .toEqual({ stamina: { enabled: false, params: { sustainable_pace: 1 } } });
    expect(storedModifiers(null)).toEqual({});
  });
});
