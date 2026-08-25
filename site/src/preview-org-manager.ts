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
import { renderRaceSettings } from './org-manager/render/tabs/race-settings.js';
import { renderAccess } from './org-manager/render/tabs/access.js';
import { renderAccount } from './org-manager/render/account.js';

const app = document.getElementById('app')!;

// Section 1: signed-out state, both variants — /org-manager's default and the
// /cli one, which drops the "CLI racing arrives later" line.
const loginSection = document.createElement('div');
app.appendChild(loginSection);
renderLogin(loginSection);

const cliLoginSection = document.createElement('div');
app.appendChild(cliLoginSection);
renderLogin(cliLoginSection, { variant: 'cli' });

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
      <button type="button" class="org-tab">access</button>
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
  view: 'org',
  ownerOrgs: new Set(['Acme']),
  linkedEmail: null,
  onSelect: () => {}, onAccount: () => {}, onCreate: () => {}, onJoin: () => {}, onLinkGoogle: () => {}, onLogout: () => {},
});

// Section 2b: the same sidebar with a Google account already linked, shown
// side by side with the unlinked one above so both renderings are visible.
const linkedSidebarSection = document.createElement('section');
linkedSidebarSection.className = 'org-preview-section';
linkedSidebarSection.innerHTML = `<h2 class="org-preview-heading">Sidebar — Google account linked</h2><div class="org-manager"><div class="org-side"></div></div>`;
app.appendChild(linkedSidebarSection);
renderSidebar(linkedSidebarSection.querySelector<HTMLElement>('.org-side')!, {
  orgs: [
    { org_id: 'o1', org_name: 'Acme' },
    { org_id: 'o2', org_name: 'RocketTeam' },
  ],
  selected: 'Acme',
  view: 'org',
  ownerOrgs: new Set(['Acme']),
  linkedEmail: 'omar@example.com',
  onSelect: () => {}, onAccount: () => {}, onCreate: () => {}, onJoin: () => {}, onLinkGoogle: () => {}, onLogout: () => {},
});

// Section 2c: the Account sidebar entry selected — the state a user with zero
// organisations lands in, since it is reachable independent of the org list.
const accountSidebarSection = document.createElement('section');
accountSidebarSection.className = 'org-preview-section';
accountSidebarSection.innerHTML = `<h2 class="org-preview-heading">Sidebar — Account selected, zero organisations</h2><div class="org-manager"><div class="org-side"></div></div>`;
app.appendChild(accountSidebarSection);
renderSidebar(accountSidebarSection.querySelector<HTMLElement>('.org-side')!, {
  orgs: [],
  selected: null,
  view: 'account',
  ownerOrgs: new Set(),
  linkedEmail: 'omar@example.com',
  onSelect: () => {}, onAccount: () => {}, onCreate: () => {}, onJoin: () => {}, onLinkGoogle: () => {}, onLogout: () => {},
});

renderOverview(shell.querySelector<HTMLElement>('.org-tabbody')!, {
  org: {
    org_id: 'o1',
    org_name: 'Acme',
    org_join_token: 'td_join_9fA3q7',
    created_at: '2026-05-14T00:00:00Z',
    creator_user_id: 'u1',
    creator_user_name: 'omar',
    access: {
      allowed_domains: [],
      join_token_enabled: true,
      domain_join_enabled: false,
      restrict_to_allowed_domains: false,
    },
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

renderMembers(tabSection('Members tab (non-owner — no Remove column)'), {
  members: [
    { user_id: 'u1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
    { user_id: 'u2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
    { user_id: 'u3', user_name: 'sam', joined_at: '2026-06-20T00:00:00Z' },
  ],
});

renderMembers(tabSection('Members tab (owner — Remove available, never on their own row)'), {
  members: [
    { user_id: 'u1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
    { user_id: 'u2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
    { user_id: 'u3', user_name: 'sam', joined_at: '2026-06-20T00:00:00Z' },
  ],
  isOwner: true,
  ownerUserId: 'u1',
  onRemove: () => {},
});

renderAccess(tabSection('Access tab (owner — token+domain joins both open)'), {
  access: {
    allowed_domains: ['acme.com'],
    join_token_enabled: true,
    domain_join_enabled: true,
    restrict_to_allowed_domains: false,
  },
  onSave: () => {},
  onRotate: () => {},
});

renderAccess(tabSection('Access tab (owner — just rotated the join token)'), {
  access: {
    allowed_domains: ['acme.com', 'acme.io'],
    join_token_enabled: true,
    domain_join_enabled: true,
    restrict_to_allowed_domains: true,
  },
  rotatedToken: 'td_join_k3mP9qXz',
  onSave: () => {},
  onRotate: () => {},
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

renderRaceSettings(tabSection('Race Settings tab (owner, saved override)'), {
  settings: {
    org_id: 'o1',
    // drain_per_min stays below the default max_drain_per_min cap here, so its
    // own effect on the time-to-red readout is visible rather than swallowed by the cap.
    stamina_config: { drain_per_min: 5, taper_floor: 40 },
    updated_at: '2026-06-01T00:00:00Z',
    updated_by_user_id: 'u1',
  },
  staminaOn: true,
  isOwner: true,
  onSave: () => {}, onReset: () => {}, onToggleStamina: () => {},
});

renderRaceSettings(tabSection('Race Settings tab (owner, no override — defaults)'), {
  settings: null,
  staminaOn: false,
  isOwner: true,
  onSave: () => {}, onReset: () => {}, onToggleStamina: () => {},
});

// Section 4: the Account view — rendered directly into `.org-main` (no
// `.org-tabs` nav), matching how index.ts draws it: a sidebar-level view, not
// a tab. Two states side by side: zero organisations / no devices at all
// (the state a brand-new SSO user lands in), and a linked account with
// several devices, including two sharing a label to show the timestamps
// disambiguating them.
function accountSection(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'org-preview-section';
  section.innerHTML = `<h2 class="org-preview-heading">${title}</h2><div class="org-manager"><div class="org-main"></div></div>`;
  app.appendChild(section);
  return section.querySelector<HTMLElement>('.org-main')!;
}

renderAccount(accountSection('Account view — zero organisations, no devices, no Google account linked'), {
  email: null,
  devices: [],
  hasLegacyCredential: false,
  onRevoke: () => {},
});

renderAccount(accountSection('Account view — no devices, but a legacy account credential still live'), {
  email: null,
  devices: [],
  hasLegacyCredential: true,
  onRevoke: () => {},
});

renderAccount(accountSection('Account view — linked account, several devices'), {
  email: 'omar@example.com',
  devices: [
    { device_id: 'd1', label: "Omar's MacBook", created_at: '2026-05-14T09:12:00Z', last_seen_at: '2026-08-20T07:45:00Z' },
    { device_id: 'd2', label: "Omar's MacBook", created_at: '2026-07-02T18:00:00Z', last_seen_at: '2026-08-19T22:10:00Z' },
    { device_id: 'd3', label: 'CI runner', created_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-08-20T06:00:00Z' },
  ],
  hasLegacyCredential: false,
  onRevoke: () => {},
});
