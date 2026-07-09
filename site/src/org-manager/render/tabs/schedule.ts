import type { GetOrgScheduleResponse, SetOrgScheduleRequest } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type ScheduleDeps = {
  schedule: GetOrgScheduleResponse['schedule'] | null;
  isOwner: boolean;
  onSave: (body: SetOrgScheduleRequest) => void;
  onClear: () => void;
};

export const DAYS: Array<[string, string]> = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];

export function renderSchedule(root: HTMLElement, deps: ScheduleDeps): void {
  const s = deps.schedule;
  const checked = new Set((s?.weekdays ?? []).map(String));
  const dayBoxes = DAYS.map(([n, label]) =>
    `<label class="org-day"><input type="checkbox" name="weekday" value="${n}"${checked.has(n) ? ' checked' : ''}${deps.isOwner ? '' : ' disabled'}> ${label}</label>`
  ).join('');

  const controls = deps.isOwner
    ? `<div class="org-actions">
         <button type="button" class="org-btn" data-action="save">Save schedule</button>
         <button type="button" class="org-btn" data-action="clear">Clear</button>
       </div>`
    : `<p class="muted">Only the organisation owner can change the schedule.</p>`;

  root.innerHTML = `
    <div class="org-panel">
      <div class="org-days">${dayBoxes}</div>
      <label class="label">Start <input name="start" value="${esc(s?.start_local ?? '09:00')}" ${deps.isOwner ? '' : 'disabled'}></label>
      <label class="label">End <input name="end" value="${esc(s?.end_local ?? '17:30')}" ${deps.isOwner ? '' : 'disabled'}></label>
      <label class="label">Timezone <input name="tz" value="${esc(s?.tz ?? 'Europe/London')}" ${deps.isOwner ? '' : 'disabled'}></label>
      <label class="label">Max <input name="max" type="number" value="${s?.max_participants ?? ''}" ${deps.isOwner ? '' : 'disabled'}></label>
      <label class="label"><input type="checkbox" name="primary_top5" ${s?.primary_top5 ? 'checked' : ''} ${deps.isOwner ? '' : 'disabled'}> Primary top-5 cap</label>
      ${controls}
    </div>
  `;

  if (deps.isOwner) {
    root.querySelector('[data-action="save"]')!.addEventListener('click', () => {
      const weekdays = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="weekday"]:checked')).map((el) => Number(el.value));
      const maxRaw = (root.querySelector('input[name="max"]') as HTMLInputElement).value.trim();
      const body: SetOrgScheduleRequest = {
        weekdays,
        start_local: (root.querySelector('input[name="start"]') as HTMLInputElement).value.trim(),
        end_local: (root.querySelector('input[name="end"]') as HTMLInputElement).value.trim(),
        tz: (root.querySelector('input[name="tz"]') as HTMLInputElement).value.trim(),
        ...(maxRaw ? { max_participants: Number(maxRaw) } : {}),
        ...((root.querySelector('input[name="primary_top5"]') as HTMLInputElement).checked ? { primary_top5: true } : {}),
      };
      deps.onSave(body);
    });
    root.querySelector('[data-action="clear"]')!.addEventListener('click', () => deps.onClear());
  }
}
