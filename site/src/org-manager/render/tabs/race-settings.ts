import type { ModifierId, ModifierSettings, RaceSettings, SetOrgRaceSettingsRequest } from '@token-derby/shared';
import { MODIFIERS, MODIFIER_IDS } from '@token-derby/shared';

export type RaceSettingsDeps = {
  settings: RaceSettings | null;
  isOwner: boolean;
  onSave: (b: SetOrgRaceSettingsRequest) => void;
  onReset: () => void;
};

const fmt = (n: number) => Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function renderRaceSettings(root: HTMLElement, deps: RaceSettingsDeps): void {
  const dis = deps.isOwner ? '' : ' disabled';
  const stored = storedSettings(deps.settings);

  // One accordion per registered mechanic: the switch in the <summary>, its
  // tuning inside, so the page stays short however many mechanics exist.
  root.innerHTML = `
    <div class="org-panel org-race-settings">
      ${MODIFIER_IDS.map(id => accordion(id, stored[id], dis)).join('')}
      <div class="org-actions">
        <button type="button" class="org-btn" data-action="save"${dis}>Save</button>
        <button type="button" class="org-btn" data-action="reset"${dis}>Reset to defaults</button>
      </div>
    </div>
  `;

  for (const id of MODIFIER_IDS) wireAccordion(root, id, () => persist(root, deps));

  if (!deps.isOwner) return;
  root.querySelector('[data-action="save"]')!.addEventListener('click', () => persist(root, deps));
  root.querySelector('[data-action="reset"]')!.addEventListener('click', () => deps.onReset());
}

/**
 * The org's stored configuration, reading the pre-`modifiers` snapshot when
 * that is all the row has. The old shape carried no on/off of its own -- that
 * lived on the schedule -- so tuning survives the move and the switch does not.
 */
function storedSettings(settings: RaceSettings | null): ModifierSettings {
  if (settings?.modifiers) return settings.modifiers;
  if (settings?.stamina_config) return { stamina: { enabled: false, params: settings.stamina_config } };
  return {};
}

function accordion(id: ModifierId, stored: ModifierSettings[ModifierId], dis: string): string {
  const modifier = MODIFIERS[id];
  const on = stored?.enabled ?? modifier.enabledByDefault;
  const params = resolved(id, stored?.params);

  // The switch lives in the <summary>, so its own click must not also open or
  // close the accordion — the two controls are independent.
  return `
    <details class="org-accordion" data-modifier="${id}">
      <summary class="org-accordion-head">
        <span class="org-accordion-heading">
          <span class="org-accordion-title">${esc(modifier.label)}</span>
          <span class="org-accordion-sub muted">${esc(modifier.description)}</span>
        </span>
        <button type="button" class="org-switch" role="switch"
          aria-label="${esc(modifier.label)} mechanic"
          aria-checked="${on ? 'true' : 'false'}"
          data-action="toggle"${dis}></button>
      </summary>

      <div class="org-accordion-body">
        <div class="org-sliders">
          ${Object.entries(modifier.params).map(([key, bound]) => `
            <div class="org-slider-row">
              <label class="label" for="${id}-${key}">${esc(bound.label)}</label>
              <input id="${id}-${key}" type="range" data-param="${key}"
                min="${bound.min}" max="${bound.max}" step="${bound.step}" value="${params[key]}"${dis}>
              <span class="org-slider-value" data-value-for="${key}">${fmt(params[key]!)} <span class="muted">(default ${fmt(bound.default)})</span></span>
            </div>`).join('')}
        </div>
        ${modifier.preview ? `
        <div class="org-readout">
          <div class="label">Consequences</div>
          <div data-readout></div>
        </div>` : ''}
      </div>
    </details>`;
}

function wireAccordion(root: HTMLElement, id: ModifierId, persistNow: () => void): void {
  const panel = root.querySelector<HTMLElement>(`[data-modifier="${id}"]`)!;
  const modifier = MODIFIERS[id];

  const paint = () => {
    const readout = panel.querySelector<HTMLElement>('[data-readout]');
    if (!readout || !modifier.preview) return;
    // Rendered by the modifier itself, from the same arithmetic the race runs,
    // so the preview cannot drift from what the server will actually do.
    readout.innerHTML = modifier.preview(readParams(panel, id))
      .map(row => `<p>${esc(row.label)} <strong>${esc(row.value)}</strong></p>`)
      .join('');
  };

  for (const el of Array.from(panel.querySelectorAll<HTMLInputElement>('input[data-param]'))) {
    const key = el.dataset.param!;
    const bound = modifier.params[key]!;
    el.addEventListener('input', () => {
      panel.querySelector(`[data-value-for="${key}"]`)!.innerHTML =
        `${fmt(Number(el.value))} <span class="muted">(default ${fmt(bound.default)})</span>`;
      paint();
    });
  }
  paint();

  const sw = panel.querySelector<HTMLButtonElement>('[data-action="toggle"]')!;
  if (sw.disabled) return;
  sw.addEventListener('click', (e) => {
    e.preventDefault();   // keep the click off the <summary>'s open/close
    e.stopPropagation();
    sw.setAttribute('aria-checked', sw.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    // The switch writes through immediately, sending every mechanic's current
    // state, so an unsaved slider beside it is carried rather than clobbered.
    persistNow();
  });
}

/** A mechanic's tuning as its sliders currently stand. */
function readParams(panel: HTMLElement, id: ModifierId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const el of Array.from(panel.querySelectorAll<HTMLInputElement>('input[data-param]'))) {
    out[el.dataset.param!] = Number(el.value);
  }
  return resolved(id, out);
}

/** A mechanic's tuning with its own defaults filled in for anything unset. */
function resolved(id: ModifierId, overrides: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, bound] of Object.entries(MODIFIERS[id].params)) {
    const value = overrides[key];
    out[key] = typeof value === 'number' && Number.isFinite(value) ? value : bound.default;
  }
  return out;
}

/**
 * Every mechanic's current state, as the org settings row stores it.
 *
 * A mechanic that is off and untuned is left out entirely: nothing ships on, so
 * an absent entry and an explicit "off" mean the same thing, and the row stays
 * readable as the registry grows.
 */
function persist(root: HTMLElement, deps: RaceSettingsDeps): void {
  const modifiers: ModifierSettings = {};
  for (const id of MODIFIER_IDS) {
    const panel = root.querySelector<HTMLElement>(`[data-modifier="${id}"]`)!;
    const enabled = panel.querySelector('[data-action="toggle"]')!.getAttribute('aria-checked') === 'true';
    const params: Record<string, number> = {};
    const current = readParams(panel, id);
    for (const [key, bound] of Object.entries(MODIFIERS[id].params)) {
      if (Math.abs(current[key]! - bound.default) > 1e-9) params[key] = current[key]!;
    }
    const tuned = Object.keys(params).length > 0;
    if (!enabled && !tuned) continue;
    modifiers[id] = { enabled, ...(tuned ? { params } : {}) };
  }
  deps.onSave(Object.keys(modifiers).length > 0 ? { modifiers } : {});
}
