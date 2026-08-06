import type { RaceSettings, SetOrgRaceSettingsRequest } from '@token-derby/shared';
import { STAMINA_PARAM_BOUNDS, resolveStaminaConfig, staminaStep, type StaminaParamKey } from '@token-derby/shared';

export type RaceSettingsDeps = {
  settings: RaceSettings | null;
  staminaOn: boolean;
  isOwner: boolean;
  onSave: (b: SetOrgRaceSettingsRequest) => void;
  onReset: () => void;
  onToggleStamina: (on: boolean) => void;
};

const PARAM_LABELS: Record<StaminaParamKey, string> = {
  sustainable_pace: 'Sustainable pace (tokens/min)',
  drain_per_min: 'Drain rate (stamina/min above pace)',
  max_drain_per_min: 'Max drain rate (stamina/min)',
  recover_per_min: 'Recovery rate (stamina/min at or below pace)',
  taper_floor: 'Taper floor (stamina %)',
  tired_multiplier: 'Tired multiplier',
};

const PARAM_KEYS = Object.keys(STAMINA_PARAM_BOUNDS) as StaminaParamKey[];

const fmt = (n: number) => Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

export function renderRaceSettings(root: HTMLElement, deps: RaceSettingsDeps): void {
  const dis = deps.isOwner ? '' : ' disabled';
  const resolved = resolveStaminaConfig({ stamina_config: deps.settings?.stamina_config });

  const sliderRow = (key: StaminaParamKey) => {
    const bound = STAMINA_PARAM_BOUNDS[key];
    const value = resolved[key];
    return `
      <div class="org-slider-row">
        <label class="label" for="stamina-${key}">${PARAM_LABELS[key]}</label>
        <input id="stamina-${key}" type="range" data-param="${key}"
          min="${bound.min}" max="${bound.max}" step="${bound.step}" value="${value}"${dis}>
        <span class="org-slider-value" data-value-for="${key}">${fmt(value)} <span class="muted">(default ${fmt(bound.default)})</span></span>
      </div>`;
  };

  root.innerHTML = `
    <div class="org-panel org-race-settings">
      <label class="label org-stamina-toggle">
        <input type="checkbox" data-action="toggle-stamina" ${deps.staminaOn ? 'checked' : ''}${dis}>
        Stamina mechanic
      </label>
      <p class="muted">Toggling this writes through to the organisation's race schedule or league — set one up on the Racing tab first.</p>

      <div class="org-sliders">${PARAM_KEYS.map(sliderRow).join('')}</div>

      <div class="org-readout">
        <div class="label">Consequences</div>
        <p>Draining begins above <strong data-readout="drain-start"></strong>.</p>
        <p>At twice the sustainable pace, full stamina reaches the taper floor in <strong data-readout="time-to-red"></strong>.</p>
        <p>A fully spent horse scores at <strong data-readout="tired-multiplier"></strong> of normal.</p>
        <p>Recovering from empty to full stamina takes <strong data-readout="recovery-time"></strong>.</p>
      </div>

      <div class="org-actions">
        <button type="button" class="org-btn" data-action="save"${dis}>Save</button>
        <button type="button" class="org-btn" data-action="reset"${dis}>Reset to defaults</button>
      </div>
    </div>
  `;

  const sliderPairs: Array<[StaminaParamKey, HTMLInputElement]> =
    PARAM_KEYS.map((key) => [key, root.querySelector<HTMLInputElement>(`input[data-param="${key}"]`)!]);

  const currentCfg = () => resolveStaminaConfig({
    stamina_config: Object.fromEntries(sliderPairs.map(([key, el]) => [key, Number(el.value)])),
  });

  const paintReadout = () => {
    const cfg = currentCfg();
    // Probing at exactly 2x sustainable_pace makes the uncapped drain term equal
    // drain_per_min itself (never zero, never dependent on the pace's absolute
    // size), so this stays meaningful — and responsive to drain_per_min — for
    // every sustainable_pace on the slider, unlike a fixed absolute probe pace.
    const probePace = cfg.sustainable_pace * 2;
    const drainStep = staminaStep({ stamina: 100, pace: probePace, minutes: 1, cfg });
    const drainPerMin = 100 - drainStep.stamina;
    const minutesToRed = (100 - cfg.taper_floor) / drainPerMin;
    const tired = staminaStep({ stamina: 0, pace: 0, minutes: 1, cfg }).multiplier;
    const recoverPerMin = staminaStep({ stamina: 0, pace: 0, minutes: 1, cfg }).stamina;
    const minutesToFull = 100 / recoverPerMin;

    root.querySelector('[data-readout="drain-start"]')!.textContent = `${fmt(cfg.sustainable_pace)} tokens/min`;
    root.querySelector('[data-readout="time-to-red"]')!.textContent = `${fmt(minutesToRed)} min`;
    root.querySelector('[data-readout="tired-multiplier"]')!.textContent = `${fmt(tired * 100)}%`;
    root.querySelector('[data-readout="recovery-time"]')!.textContent = `${fmt(minutesToFull)} min`;
  };

  sliderPairs.forEach(([key, el]) => {
    el.addEventListener('input', () => {
      const bound = STAMINA_PARAM_BOUNDS[key];
      root.querySelector(`[data-value-for="${key}"]`)!.innerHTML =
        `${fmt(Number(el.value))} <span class="muted">(default ${fmt(bound.default)})</span>`;
      paintReadout();
    });
  });

  paintReadout();

  if (!deps.isOwner) return;

  root.querySelector('[data-action="toggle-stamina"]')!.addEventListener('change', (e) =>
    deps.onToggleStamina((e.target as HTMLInputElement).checked));

  root.querySelector('[data-action="save"]')!.addEventListener('click', () => {
    const cfg = currentCfg();
    const stamina_config: Record<string, number> = {};
    for (const key of PARAM_KEYS) {
      if (Math.abs(cfg[key] - STAMINA_PARAM_BOUNDS[key].default) > 1e-9) stamina_config[key] = cfg[key];
    }
    deps.onSave(Object.keys(stamina_config).length > 0 ? { stamina_config } : {});
  });

  root.querySelector('[data-action="reset"]')!.addEventListener('click', () => deps.onReset());
}
