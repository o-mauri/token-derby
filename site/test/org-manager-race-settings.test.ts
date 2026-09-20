import { describe, it, expect, vi } from 'vitest';
import { renderRaceSettings } from '../src/org-manager/render/tabs/race-settings.js';
import { MODIFIERS, MODIFIER_IDS } from '@token-derby/shared';
import type { RaceSettingsDeps } from '../src/org-manager/render/tabs/race-settings.js';

const BOUNDS = MODIFIERS.stamina.params;
const mount = () => document.createElement('div');

function render(over: Partial<RaceSettingsDeps> = {}): HTMLElement {
  const root = mount();
  renderRaceSettings(root, {
    settings: null, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), ...over,
  });
  return root;
}

/** Settings holding one stamina tuning override, switched on. */
const tuned = (params: Record<string, number>): RaceSettingsDeps['settings'] => ({
  org_id: 'o', modifiers: { stamina: { enabled: true, params } },
  updated_at: 'x', updated_by_user_id: 'u',
});

const readout = (root: HTMLElement) => root.querySelector('[data-modifier="stamina"] [data-readout]')!.textContent;

describe('renderRaceSettings — generated from the registry', () => {
  it('renders one accordion per registered mechanic', () => {
    const root = render();
    expect(root.querySelectorAll('[data-modifier]')).toHaveLength(MODIFIER_IDS.length);
    for (const id of MODIFIER_IDS) {
      expect(root.querySelector(`[data-modifier="${id}"]`)).not.toBeNull();
    }
  });

  it('names a mechanic from the modifier, not from a copy kept here', () => {
    const root = render();
    const panel = root.querySelector('[data-modifier="stamina"]')!;
    expect(panel.querySelector('.org-accordion-title')!.textContent).toBe(MODIFIERS.stamina.label);
    expect(panel.querySelector('.org-accordion-sub')!.textContent).toBe(MODIFIERS.stamina.description);
  });

  it('renders one slider per parameter, at its default and within its bounds', () => {
    const root = render();
    const sliders = root.querySelectorAll<HTMLInputElement>('[data-modifier="stamina"] input[type="range"]');
    expect(sliders).toHaveLength(Object.keys(BOUNDS).length);
    const pace = root.querySelector<HTMLInputElement>('input[data-param="sustainable_pace"]')!;
    expect(Number(pace.value)).toBe(BOUNDS.sustainable_pace!.default);
    expect(pace.min).toBe(String(BOUNDS.sustainable_pace!.min));
    expect(pace.max).toBe(String(BOUNDS.sustainable_pace!.max));
  });

  it('labels each slider from the parameter itself', () => {
    const root = render();
    const label = root.querySelector('label[for="stamina-sustainable_pace"]')!;
    expect(label.textContent).toBe(BOUNDS.sustainable_pace!.label);
  });

  it('shows a saved override rather than the default', () => {
    const root = render({ settings: tuned({ drain_per_min: 9 }) });
    expect(Number(root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!.value)).toBe(9);
  });

  it('shows the switch as on for a mechanic the org enabled', () => {
    const root = render({ settings: tuned({}) });
    expect(root.querySelector('[data-modifier="stamina"] [data-action="toggle"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('shows every mechanic off when nothing is configured, since none ship on', () => {
    const root = render();
    for (const sw of Array.from(root.querySelectorAll('[data-action="toggle"]'))) {
      expect(sw.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('disables every control for a non-owner', () => {
    const root = render({ isOwner: false });
    root.querySelectorAll<HTMLInputElement>('input, button').forEach(el => expect(el.disabled).toBe(true));
  });
});

describe('renderRaceSettings — consequences readout', () => {
  it('recomputes as drain_per_min moves', () => {
    const root = render();
    const before = readout(root);
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = String(BOUNDS.drain_per_min!.max);
    drain.dispatchEvent(new Event('input'));
    expect(readout(root)).not.toBe(before);
  });

  it('recomputes as max_drain_per_min moves, once drain is already capped', () => {
    // Start with drain_per_min already high enough that the default cap binds —
    // otherwise raising the cap further can never change an already-uncapped rate.
    const root = render({ settings: tuned({ drain_per_min: BOUNDS.drain_per_min!.max }) });
    const before = readout(root);
    const cap = root.querySelector<HTMLInputElement>('input[data-param="max_drain_per_min"]')!;
    cap.value = String(BOUNDS.max_drain_per_min!.max);
    cap.dispatchEvent(new Event('input'));
    expect(readout(root)).not.toBe(before);
  });

  it('recomputes as recover_per_min moves', () => {
    const root = render();
    const before = readout(root);
    const recover = root.querySelector<HTMLInputElement>('input[data-param="recover_per_min"]')!;
    recover.value = String(BOUNDS.recover_per_min!.max);
    recover.dispatchEvent(new Event('input'));
    expect(readout(root)).not.toBe(before);
  });

  it('renders the lines the modifier itself supplies', () => {
    const root = render();
    for (const row of MODIFIERS.stamina.preview!(Object.fromEntries(
      Object.entries(BOUNDS).map(([k, b]) => [k, b.default]),
    ))) {
      expect(readout(root)).toContain(row.label);
    }
  });
});

describe('renderRaceSettings — saving', () => {
  const toggleOn = (root: HTMLElement) =>
    root.querySelector<HTMLButtonElement>('[data-modifier="stamina"] [data-action="toggle"]')!.click();

  it('saves only the values that differ from the defaults', () => {
    const onSave = vi.fn();
    const root = render({ settings: tuned({}), onSave });
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = '9';
    drain.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(onSave).toHaveBeenCalledWith({ modifiers: { stamina: { enabled: true, params: { drain_per_min: 9 } } } });
  });

  it('saves a mechanic that is on but untuned without a params key', () => {
    const onSave = vi.fn();
    const root = render({ settings: tuned({}), onSave });
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(onSave).toHaveBeenCalledWith({ modifiers: { stamina: { enabled: true } } });
  });

  it('leaves out a mechanic that is off and untuned, rather than storing a no-op', () => {
    const onSave = vi.fn();
    const root = render({ onSave });
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(onSave).toHaveBeenCalledWith({});
  });

  it('keeps tuning for a mechanic that is switched off', () => {
    const onSave = vi.fn();
    const root = render({ onSave });
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = '9';
    drain.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(onSave).toHaveBeenCalledWith({ modifiers: { stamina: { enabled: false, params: { drain_per_min: 9 } } } });
  });

  it('writes through the moment the switch is flipped', () => {
    const onSave = vi.fn();
    const root = render({ onSave });
    toggleOn(root);
    expect(onSave).toHaveBeenCalledWith({ modifiers: { stamina: { enabled: true } } });
  });

  it('carries an unsaved slider through a switch flip rather than clobbering it', () => {
    const onSave = vi.fn();
    const root = render({ onSave });
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = '9';
    drain.dispatchEvent(new Event('input'));
    toggleOn(root);
    expect(onSave).toHaveBeenCalledWith({ modifiers: { stamina: { enabled: true, params: { drain_per_min: 9 } } } });
  });

  it('does not let a non-owner save by clicking the switch', () => {
    const onSave = vi.fn();
    const root = render({ isOwner: false, onSave });
    toggleOn(root);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('renderRaceSettings — orgs configured before the settings map', () => {
  it('reads tuning out of the old stamina_config snapshot', () => {
    const root = render({
      settings: { org_id: 'o', stamina_config: { drain_per_min: 9 }, updated_at: 'x', updated_by_user_id: 'u' },
    });
    expect(Number(root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!.value)).toBe(9);
  });

  it('shows the mechanic as off, since the old shape kept that on the schedule', () => {
    const root = render({
      settings: { org_id: 'o', stamina_config: { drain_per_min: 9 }, updated_at: 'x', updated_by_user_id: 'u' },
    });
    expect(root.querySelector('[data-modifier="stamina"] [data-action="toggle"]')!.getAttribute('aria-checked')).toBe('false');
  });
});
