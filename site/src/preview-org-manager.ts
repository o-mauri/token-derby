// Standalone preview of the /org-manager UI, rendered against static
// fixtures — no network calls. Loaded by /preview-org-manager.html, not part
// of the main app bundle. Mirrors admin/'s preview-admin.ts approach.
import { renderLogin } from './org-manager/render/login.js';
import { renderSidebar } from './org-manager/render/sidebar.js';
import { renderOverview } from './org-manager/render/tabs/overview.js';
import { renderMembers } from './org-manager/render/tabs/members.js';
import { renderRacing } from './org-manager/render/tabs/racing.js';
import { renderWebhook } from './org-manager/render/tabs/webhook.js';
import { renderSlackbot } from './org-manager/render/tabs/slackbot.js';

const app = document.getElementById('app')!;

// Section 1: signed-out state.
const loginSection = document.createElement('div');
app.appendChild(loginSection);
renderLogin(loginSection);

// Section 2: signed-in shell — sidebar + a static tab strip + the Overview
// tab body, matching the real DOM shape produced by org-manager/index.ts.
const shell = document.createElement('div');
shell.className = 'org-manager';
shell.innerHTML = `
  <div class="org-side"></div>
  <div class="org-main">
    <nav class="org-tabs">
      <button type="button" class="org-tab on">overview</button>
      <button type="button" class="org-tab">members</button>
      <button type="button" class="org-tab">racing</button>
      <button type="button" class="org-tab">webhook</button>
      <button type="button" class="org-tab">slackbot</button>
    </nav>
    <div class="org-tabbody"></div>
  </div>
`;
app.appendChild(shell);

renderSidebar(shell.querySelector<HTMLElement>('.org-side')!, {
  orgs: [
    { org_id: 'o1', org_name: 'Acme' },
    { org_id: 'o2', org_name: 'RocketTeam' },
  ],
  selected: 'Acme',
  ownerOrgs: new Set(['Acme']),
  onSelect: () => {}, onCreate: () => {}, onJoin: () => {}, onLogout: () => {},
});

renderOverview(shell.querySelector<HTMLElement>('.org-tabbody')!, {
  org: {
    org_id: 'o1',
    org_name: 'Acme',
    org_join_token: 'td_join_9fA3q7',
    created_at: '2026-05-14T00:00:00Z',
    creator_user_id: 'u1',
    creator_user_name: 'omar',
  },
});

// Section 3: the remaining tabs, each rendered into its own standalone panel
// stacked below the shell so every screen is legible in one screenshot
// without wiring up live tab-switching.
function tabSection(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'org-preview-section';
  section.innerHTML = `<h2 class="org-preview-heading">${title}</h2><div class="org-manager"><div class="org-main"><div class="org-tabbody"></div></div></div>`;
  app.appendChild(section);
  return section.querySelector<HTMLElement>('.org-tabbody')!;
}

renderMembers(tabSection('Members tab'), {
  members: [
    { user_id: 'u1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
    { user_id: 'u2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
    { user_id: 'u3', user_name: 'sam', joined_at: '2026-06-20T00:00:00Z' },
  ],
});

renderRacing(tabSection('Racing tab (owner) — League mode'), {
  schedule: null,
  league: {
    org_id: 'o1',
    divisions: [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 12 }, { name: 'League One', cap: 16 }],
    boundaries: [2, 3],
    races_per_season: 8,
    weekdays: [1, 3, 5],
    start_local: '19:00',
    end_local: '21:00',
    tz: 'Europe/London',
    race_name: 'Acme League',
    max_participants: 20,
    primary_top5: true,
    current_season: 1,
    status: 'active',
    created_at: '2026-05-14T00:00:00Z',
    creator_user_id: 'u1',
    creator_user_name: 'omar',
  },
  isOwner: true,
  onSaveSchedule: () => {}, onClearSchedule: () => {}, onSaveLeague: () => {}, onClearLeague: () => {},
});

renderRacing(tabSection('Racing tab (owner) — Scheduled races mode'), {
  schedule: {
    org_id: 'o1',
    weekdays: [1, 2, 3, 4, 5],
    start_local: '09:00',
    end_local: '17:30',
    tz: 'Europe/London',
    max_participants: 20,
    primary_top5: true,
    created_at: '2026-05-14T00:00:00Z',
    creator_user_id: 'u1',
    creator_user_name: 'omar',
  },
  league: null,
  isOwner: true,
  onSaveSchedule: () => {}, onClearSchedule: () => {}, onSaveLeague: () => {}, onClearLeague: () => {},
});

renderWebhook(tabSection('Webhook tab (owner, just saved)'), {
  webhook: { webhook_url: 'https://example.com/hooks/token-derby' },
  isOwner: true,
  lastSecret: 'whsec_9F3kD8pQ2xR7',
  onSave: () => {},
  onClear: () => {},
});

renderSlackbot(tabSection('Slackbot tab (owner, configured)'), {
  slack: {
    configured: true,
    channel_id: 'C0123',
    messages: { race_created: true, race_ended: true, league_season_ended: false, weekly_digest: true, release_published: false },
    digest: { weekday: 5, time_local: '15:00', tz: 'Europe/London' },
  },
  isOwner: true,
  onSave: () => {},
  onClear: () => {},
});

renderSlackbot(tabSection('Slackbot tab (non-owner)'), {
  slack: null,
  isOwner: false,
  onSave: () => {},
  onClear: () => {},
});
