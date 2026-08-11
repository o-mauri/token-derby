import { describe, it, expect, vi } from 'vitest';
import { renderRaceSettings } from '../src/org-manager/render/tabs/race-settings.js';
import { STAMINA_PARAM_BOUNDS } from '@token-derby/shared';

const mount = () => document.createElement('div');

describe('renderRaceSettings', () => {
  it('renders one slider per stamina parameter, at its default', () => {
    const root = mount();
    renderRaceSettings(root, { settings: null, staminaOn: false, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn() });
    const sliders = root.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders).toHaveLength(Object.keys(STAMINA_PARAM_BOUNDS).length);
    const pace = root.querySelector<HTMLInputElement>('input[data-param="sustainable_pace"]')!;
    expect(Number(pace.value)).toBe(STAMINA_PARAM_BOUNDS.sustainable_pace.default);
    expect(pace.min).toBe(String(STAMINA_PARAM_BOUNDS.sustainable_pace.min));
    expect(pace.max).toBe(String(STAMINA_PARAM_BOUNDS.sustainable_pace.max));
  });

  it('shows a saved override rather than the default', () => {
    const root = mount();
    renderRaceSettings(root, {
      settings: { org_id: 'o', stamina_config: { drain_per_min: 9 }, updated_at: 'x', updated_by_user_id: 'u' },
      staminaOn: true, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn(),
    });
    expect(Number(root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!.value)).toBe(9);
  });

  it('disables every control for a non-owner', () => {
    const root = mount();
    renderRaceSettings(root, { settings: null, staminaOn: false, isOwner: false, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn() });
    root.querySelectorAll<HTMLInputElement>('input, button').forEach(el => expect(el.disabled).toBe(true));
  });

  it('recomputes the time-to-red readout as drain_per_min moves', () => {
    const root = mount();
    renderRaceSettings(root, { settings: null, staminaOn: true, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn() });
    const before = root.querySelector('[data-readout="time-to-red"]')!.textContent;
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = String(STAMINA_PARAM_BOUNDS.drain_per_min.max);
    drain.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-readout="time-to-red"]')!.textContent).not.toBe(before);
  });

  it('recomputes the time-to-red readout as max_drain_per_min moves, once drain is already capped', () => {
    const root = mount();
    // Start with drain_per_min already high enough that the default cap binds —
    // otherwise raising the cap further can never change an already-uncapped rate.
    renderRaceSettings(root, {
      settings: { org_id: 'o', stamina_config: { drain_per_min: STAMINA_PARAM_BOUNDS.drain_per_min.max }, updated_at: 'x', updated_by_user_id: 'u' },
      staminaOn: true, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn(),
    });
    const before = root.querySelector('[data-readout="time-to-red"]')!.textContent;
    const cap = root.querySelector<HTMLInputElement>('input[data-param="max_drain_per_min"]')!;
    cap.value = String(STAMINA_PARAM_BOUNDS.max_drain_per_min.max);
    cap.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-readout="time-to-red"]')!.textContent).not.toBe(before);
  });

  it('recomputes the recovery-time readout as recover_per_min moves', () => {
    const root = mount();
    renderRaceSettings(root, { settings: null, staminaOn: true, isOwner: true, onSave: vi.fn(), onReset: vi.fn(), onToggleStamina: vi.fn() });
    const before = root.querySelector('[data-readout="recovery-time"]')!.textContent;
    const recover = root.querySelector<HTMLInputElement>('input[data-param="recover_per_min"]')!;
    recover.value = String(STAMINA_PARAM_BOUNDS.recover_per_min.max);
    recover.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-readout="recovery-time"]')!.textContent).not.toBe(before);
  });

  it('saves only the values that differ from the defaults', () => {
    const onSave = vi.fn();
    const root = mount();
    renderRaceSettings(root, { settings: null, staminaOn: true, isOwner: true, onSave, onReset: vi.fn(), onToggleStamina: vi.fn() });
    const drain = root.querySelector<HTMLInputElement>('input[data-param="drain_per_min"]')!;
    drain.value = '9';
    drain.dispatchEvent(new Event('input'));
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(onSave).toHaveBeenCalledWith({ stamina_config: { drain_per_min: 9 } });
  });
});
