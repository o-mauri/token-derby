import type { League, SetOrgLeagueRequest } from '@token-derby/shared';
import { validateLeagueConfig } from '@token-derby/shared';
import { esc } from '../../../esc.js';
import { DAYS } from './schedule.js';

export type LeagueEditorDeps = {
  league: League | null;
  isOwner: boolean;
  onSave: (body: SetOrgLeagueRequest) => void;
  onClear: () => void;
};

// Internal editable shape: every division carries a cap >= 1 in state even though
// the last (overflow) division's cap is ignored — this keeps "add division" simple
// (the previously-last row already has a cap to show once it stops being last).
type Div = { name: string; cap: number };

const DEFAULT_CAP = 10;

export function renderLeagueEditor(root: HTMLElement, deps: LeagueEditorDeps): void {
  const src = deps.league;
  const divisions: Div[] = src
    ? src.divisions.map((d) => ({ name: d.name, cap: d.cap >= 1 ? d.cap : DEFAULT_CAP }))
    : [{ name: 'Division 1', cap: DEFAULT_CAP }, { name: 'Division 2', cap: DEFAULT_CAP }];
  const boundaries: number[] = src ? src.boundaries.slice() : [2];

  const dis = deps.isOwner ? '' : ' disabled';
  const checked = new Set((src?.weekdays ?? [1, 2, 3, 4, 5]).map(String));
  const dayBoxes = DAYS.map(([n, label]) =>
    `<label class="org-day"><input type="checkbox" name="weekday" value="${n}"${checked.has(n) ? ' checked' : ''}${dis}> ${label}</label>`
  ).join('');

  const controls = deps.isOwner
    ? `<div class="org-actions">
         <button type="button" class="org-btn" data-action="save-league">Save league</button>
         <button type="button" class="org-btn" data-action="delete-league">Delete league</button>
       </div>`
    : `<p class="muted">Only the organisation owner can change the league.</p>`;

  root.innerHTML = `
    <div class="org-panel">
      <div class="label">Divisions (top → bottom)</div>
      ${deps.league && deps.isOwner ? `<p class="org-div-note muted">Division and season-length changes take effect next season; schedule and options apply immediately.</p>` : ''}
      <div class="org-divisions"></div>
      ${deps.isOwner ? `<button type="button" class="org-btn" data-action="add-division">+ Add division</button>` : ''}
      <p class="org-div-summary muted"></p>

      <div class="label">Season</div>
      <label class="label">Races / season <input name="races" type="number" min="1" value="${src?.races_per_season ?? 8}"${dis}></label>

      <div class="label">Schedule</div>
      <div class="org-days">${dayBoxes}</div>
      <label class="label">Start <input name="start" value="${esc(src?.start_local ?? '09:00')}"${dis}></label>
      <label class="label">End <input name="end" value="${esc(src?.end_local ?? '17:30')}"${dis}></label>
      <label class="label">Timezone <input name="tz" value="${esc(src?.tz ?? 'Europe/London')}"${dis}></label>

      <div class="label">Options</div>
      <label class="label">Race name <input name="race_name" value="${esc(src?.race_name ?? '')}"${dis}></label>
      <label class="label">Max <input name="max" type="number" value="${src?.max_participants ?? ''}"${dis}></label>
      <label class="label"><input type="checkbox" name="primary_top5"${src?.primary_top5 ? ' checked' : ''}${dis}> Primary top-5 cap</label>
      <label class="label"><input type="checkbox" name="counts_input"${src?.counts_input ? ' checked' : ''}${dis}> Counts as input</label>

      <p class="org-error"></p>
      ${controls}
    </div>
  `;

  const divsEl = root.querySelector<HTMLElement>('.org-divisions')!;
  const summaryEl = root.querySelector<HTMLElement>('.org-div-summary')!;
  const errorEl = root.querySelector<HTMLElement>('.org-error')!;

  // Read the current DOM inputs back into the divisions/boundaries state so that
  // edits survive a re-render (triggered by add/remove).
  function syncFromDom(): void {
    divsEl.querySelectorAll<HTMLElement>('.org-div-row').forEach((rowEl, i) => {
      const nameEl = rowEl.querySelector<HTMLInputElement>('.org-div-name');
      if (nameEl) divisions[i]!.name = nameEl.value;
      const capEl = rowEl.querySelector<HTMLInputElement>('.org-div-cap input');
      if (capEl) divisions[i]!.cap = capEl.value.trim() === '' ? NaN : Number(capEl.value);
    });
    divsEl.querySelectorAll<HTMLInputElement>('.org-div-swapn').forEach((el, i) => {
      boundaries[i] = el.value.trim() === '' ? NaN : Number(el.value);
    });
  }

  function summaryText(): string {
    syncFromDom();
    const parts = divisions.map((d, i) => {
      const capStr = i === divisions.length - 1 ? '∞' : (Number.isFinite(d.cap) ? String(d.cap) : '?');
      const seg = `${d.name || '—'} (${capStr})`;
      return i < boundaries.length ? `${seg} ⇄${Number.isFinite(boundaries[i]) ? boundaries[i] : '?'}` : seg;
    });
    const races = Number(root.querySelector<HTMLInputElement>('input[name="races"]')!.value) || 0;
    return `${parts.join(' ')} · ${races} races/season`;
  }

  function paintDivisions(): void {
    divsEl.innerHTML = divisions.map((d, i) => {
      const isLast = i === divisions.length - 1;
      const removable = deps.isOwner && divisions.length > 1;
      const capCell = isLast
        ? `<span class="org-div-overflow">bottom · uncapped (overflow)</span>`
        : `<label class="org-div-cap">cap <input type="number" min="1" value="${Number.isFinite(d.cap) ? d.cap : ''}"${dis}></label>`;
      const remove = removable ? `<button type="button" class="org-btn org-div-remove" data-i="${i}">✕</button>` : '';
      const row = `<div class="org-div-row" data-i="${i}">
          <span class="org-div-n">${i + 1}</span>
          <input class="org-div-name" maxlength="40" value="${esc(d.name)}"${dis}>
          ${capCell}${remove}
        </div>`;
      const swap = i < boundaries.length
        ? `<div class="org-div-swap">⇅ <label>swap <input type="number" min="1" class="org-div-swapn" value="${Number.isFinite(boundaries[i]) ? boundaries[i] : ''}"${dis}></label>
             <span class="org-div-swaptext">${Number.isFinite(boundaries[i]) ? boundaries[i] : '?'} down · ${Number.isFinite(boundaries[i]) ? boundaries[i] : '?'} up</span></div>`
        : '';
      return row + swap;
    }).join('');

    if (deps.isOwner) {
      divsEl.querySelectorAll<HTMLElement>('.org-div-remove').forEach((btn) =>
        btn.addEventListener('click', () => {
          syncFromDom();
          const i = Number(btn.dataset.i);
          divisions.splice(i, 1);
          // Drop one boundary so boundaries.length === divisions.length - 1.
          const bi = Math.min(i, boundaries.length - 1);
          if (bi >= 0) boundaries.splice(bi, 1);
          paintDivisions();
        }));
      divsEl.querySelectorAll<HTMLInputElement>('.org-div-swapn').forEach((el, i) =>
        el.addEventListener('input', () => {
          const v = el.value.trim() === '' ? NaN : Number(el.value);
          const t = el.closest('.org-div-swap')!.querySelector('.org-div-swaptext')!;
          t.textContent = `${Number.isFinite(v) ? v : '?'} down · ${Number.isFinite(v) ? v : '?'} up`;
          summaryEl.textContent = summaryText();
        }));
    }
    summaryEl.textContent = summaryText();
  }

  paintDivisions();

  // Live summary update — bound to the panel (discarded when the mode picker
  // swaps the body via innerHTML) so it can't leak onto a sibling mode's form.
  root.querySelector('.org-panel')!.addEventListener('input', () => { summaryEl.textContent = summaryText(); });

  if (deps.isOwner) {
    root.querySelector('[data-action="add-division"]')!.addEventListener('click', () => {
      syncFromDom();
      const aboveCap = Number.isFinite(divisions[divisions.length - 1]!.cap) ? divisions[divisions.length - 1]!.cap : DEFAULT_CAP;
      divisions.push({ name: `Division ${divisions.length + 1}`, cap: aboveCap });
      boundaries.push(2);
      paintDivisions();
    });

    root.querySelector('[data-action="delete-league"]')!.addEventListener('click', () => deps.onClear());

    root.querySelector('[data-action="save-league"]')!.addEventListener('click', () => {
      syncFromDom();
      const weekdays = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="weekday"]:checked')).map((el) => Number(el.value));
      const maxRaw = root.querySelector<HTMLInputElement>('input[name="max"]')!.value.trim();
      const raceName = root.querySelector<HTMLInputElement>('input[name="race_name"]')!.value.trim();
      const body: SetOrgLeagueRequest = {
        divisions: divisions.map((d) => ({ name: d.name.trim(), cap: d.cap })),
        boundaries: boundaries.slice(),
        races_per_season: Number(root.querySelector<HTMLInputElement>('input[name="races"]')!.value),
        weekdays,
        start_local: root.querySelector<HTMLInputElement>('input[name="start"]')!.value.trim(),
        end_local: root.querySelector<HTMLInputElement>('input[name="end"]')!.value.trim(),
        tz: root.querySelector<HTMLInputElement>('input[name="tz"]')!.value.trim(),
        ...(raceName ? { race_name: raceName } : {}),
        ...(maxRaw ? { max_participants: Number(maxRaw) } : {}),
        ...(root.querySelector<HTMLInputElement>('input[name="primary_top5"]')!.checked ? { primary_top5: true } : {}),
        ...(root.querySelector<HTMLInputElement>('input[name="counts_input"]')!.checked ? { counts_input: true } : {}),
      };
      // Reuse the shared validator so client rules never drift from the server's.
      const msg = validateLeagueConfig(body);
      if (msg) { errorEl.textContent = msg; return; }
      if (!body.tz) { errorEl.textContent = 'Timezone is required'; return; }
      errorEl.textContent = '';
      deps.onSave(body);
    });
  }
}
