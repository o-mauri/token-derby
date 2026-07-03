// Standalone preview of the /org-manager UI, rendered against static
// fixtures — no network calls. Loaded by /preview-org-manager.html, not part
// of the main app bundle. Mirrors admin/'s preview-admin.ts approach.
import { renderLogin } from './org-manager/render/login.js';
import { renderSidebar } from './org-manager/render/sidebar.js';
import { renderOverview } from './org-manager/render/tabs/overview.js';
import { renderMembers } from './org-manager/render/tabs/members.js';
import { renderSchedule } from './org-manager/render/tabs/schedule.js';
import { renderWebhook } from './org-manager/render/tabs/webhook.js';

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
      <button type="button" class="org-tab">schedule</button>
      <button type="button" class="org-tab">webhook</button>
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

renderSchedule(tabSection('Schedule tab (owner)'), {
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
  isOwner: true,
  onSave: () => {},
  onClear: () => {},
});

renderWebhook(tabSection('Webhook tab (owner, just saved)'), {
  webhook: { webhook_url: 'https://example.com/hooks/token-derby' },
  isOwner: true,
  lastSecret: 'whsec_9F3kD8pQ2xR7',
  onSave: () => {},
  onClear: () => {},
});
