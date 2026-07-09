import type { League, SetOrgLeagueRequest, GetOrgScheduleResponse, SetOrgScheduleRequest } from '@token-derby/shared';
import { renderSchedule } from './schedule.js';
import { renderLeagueEditor } from './league-editor.js';

export type RacingMode = 'off' | 'scheduled' | 'league';

export type RacingDeps = {
  schedule: GetOrgScheduleResponse['schedule'] | null;
  league: League | null;
  isOwner: boolean;
  onSaveSchedule: (b: SetOrgScheduleRequest) => void;
  onClearSchedule: () => void;
  onSaveLeague: (b: SetOrgLeagueRequest) => void;
  onClearLeague: () => void;
};

const MODES: Array<[RacingMode, string]> = [['off', 'Off'], ['scheduled', 'Scheduled races'], ['league', 'League']];

export function renderRacing(root: HTMLElement, deps: RacingDeps): void {
  // The configured mode is whatever the org currently has; that's the initial selection.
  const configured: RacingMode = deps.league ? 'league' : deps.schedule ? 'scheduled' : 'off';
  let mode: RacingMode = configured;
  const dis = deps.isOwner ? '' : ' disabled';

  root.innerHTML = `
    <div class="org-racing">
      <div class="label">Racing mode</div>
      <div class="org-racing-modes">
        ${MODES.map(([m, label]) =>
          `<label class="org-racing-mode"><input type="radio" name="racing-mode" value="${m}"${m === mode ? ' checked' : ''}${dis}> ${label}</label>`
        ).join('')}
      </div>
      <p class="org-racing-warn"></p>
      <div class="org-racing-body"></div>
    </div>
  `;

  const bodyEl = root.querySelector<HTMLElement>('.org-racing-body')!;
  const warnEl = root.querySelector<HTMLElement>('.org-racing-warn')!;

  const paintBody = () => {
    // Warn when the chosen mode differs from what's configured and the other exists.
    if (mode !== configured && configured !== 'off') {
      const other = configured === 'league' ? 'league' : 'race schedule';
      warnEl.textContent = `Saving will replace this organisation's current ${other}.`;
    } else {
      warnEl.textContent = '';
    }

    if (mode === 'league') {
      renderLeagueEditor(bodyEl, {
        league: deps.league, isOwner: deps.isOwner,
        onSave: deps.onSaveLeague, onClear: deps.onClearLeague,
      });
    } else if (mode === 'scheduled') {
      renderSchedule(bodyEl, {
        schedule: deps.schedule, isOwner: deps.isOwner,
        onSave: deps.onSaveSchedule, onClear: deps.onClearSchedule,
      });
    } else {
      // Off
      if (configured !== 'off' && deps.isOwner) {
        bodyEl.innerHTML = `<div class="org-panel">
          <p class="muted">Racing is currently ${configured === 'league' ? 'a league' : 'a race schedule'}.</p>
          <div class="org-actions"><button type="button" class="org-btn" data-action="turn-off">Turn off racing</button></div>
        </div>`;
        bodyEl.querySelector('[data-action="turn-off"]')!.addEventListener('click', () =>
          configured === 'league' ? deps.onClearLeague() : deps.onClearSchedule());
      } else {
        bodyEl.innerHTML = `<p class="muted">This organisation isn't racing. Pick Scheduled races or League to set it up.</p>`;
      }
    }
  };

  paintBody();

  if (deps.isOwner) {
    root.querySelectorAll<HTMLInputElement>('input[name="racing-mode"]').forEach((el) =>
      el.addEventListener('change', () => { if (el.checked) { mode = el.value as RacingMode; paintBody(); } }));
  }
}
