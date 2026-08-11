import type { GetOrgSlackResponse, OrgSlackMessages, SetOrgSlackRequest } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type SlackbotDeps = {
  slack: GetOrgSlackResponse | null;
  isOwner: boolean;
  onSave: (body: SetOrgSlackRequest) => void;
  onClear: () => void;
};

const DAYS: Array<[string, string]> = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const MSGS: Array<[keyof NonNullable<GetOrgSlackResponse['messages']>, string]> = [
  ['race_created', 'Race created'],
  ['race_ended', 'Race ended'],
  ['league_season_ended', 'League season ended'],
  ['weekly_digest', 'Weekly org update'],
  ['release_published', 'Release published'],
];

export function renderSlackbot(root: HTMLElement, deps: SlackbotDeps): void {
  const s = deps.slack;
  const m = s?.messages ?? { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: false, release_published: false };
  const d = s?.digest ?? { weekday: 5, time_local: '15:00', tz: 'Europe/London' };
  const dis = deps.isOwner ? '' : ' disabled';

  const msgBoxes = MSGS.map(([k, label]) =>
    `<label class="org-day"><input type="checkbox" name="msg" value="${k}"${m[k] ? ' checked' : ''}${dis}> ${label}</label>`
  ).join('');
  const dayOpts = DAYS.map(([n, label]) => `<option value="${n}"${String(d.weekday) === n ? ' selected' : ''}>${label}</option>`).join('');

  const controls = deps.isOwner
    ? `<div class="org-actions">
         <button type="button" class="org-btn" data-action="save">Save Slack bot</button>
         <button type="button" class="org-btn" data-action="clear">Clear</button>
       </div>`
    : `<p class="muted">Only the organisation owner can change the Slack bot.</p>`;

  root.innerHTML = `
    <div class="org-panel">
      <label class="label">Bot token
        <input name="bot_token" type="password" placeholder="${s?.configured ? 'configured — leave blank to keep' : 'xoxb-…'}"${dis}></label>
      <label class="label">Channel ID
        <input name="channel_id" value="${esc(s?.channel_id ?? '')}" placeholder="C0123…"${dis}></label>
      <div class="org-days">${msgBoxes}</div>
      <fieldset class="org-digest">
        <legend>Weekly digest schedule</legend>
        <label class="label">Day <select name="weekday"${dis}>${dayOpts}</select></label>
        <label class="label">Time <input name="time_local" value="${esc(d.time_local)}"${dis}></label>
        <label class="label">Timezone <input name="tz" value="${esc(d.tz)}"${dis}></label>
      </fieldset>
      ${controls}
    </div>
  `;

  if (deps.isOwner) {
    root.querySelector('[data-action="save"]')!.addEventListener('click', () => {
      const checked = new Set(Array.from(root.querySelectorAll<HTMLInputElement>('input[name="msg"]:checked')).map((el) => el.value));
      const messages = Object.fromEntries(MSGS.map(([k]) => [k, checked.has(k)])) as OrgSlackMessages;
      const tokenRaw = (root.querySelector('input[name="bot_token"]') as HTMLInputElement).value.trim();
      const body: SetOrgSlackRequest = {
        ...(tokenRaw ? { bot_token: tokenRaw } : {}),
        channel_id: (root.querySelector('input[name="channel_id"]') as HTMLInputElement).value.trim(),
        messages,
        ...(messages.weekly_digest ? {
          digest: {
            weekday: Number((root.querySelector('select[name="weekday"]') as HTMLSelectElement).value),
            time_local: (root.querySelector('input[name="time_local"]') as HTMLInputElement).value.trim(),
            tz: (root.querySelector('input[name="tz"]') as HTMLInputElement).value.trim(),
          },
        } : {}),
      };
      deps.onSave(body);
    });
    root.querySelector('[data-action="clear"]')!.addEventListener('click', () => deps.onClear());
  }
}
