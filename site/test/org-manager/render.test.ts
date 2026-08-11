import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLogin } from '../../src/org-manager/render/login.js';
import { renderSidebar } from '../../src/org-manager/render/sidebar.js';
import { renderOverview } from '../../src/org-manager/render/tabs/overview.js';
import { renderSchedule } from '../../src/org-manager/render/tabs/schedule.js';
import { renderWebhook } from '../../src/org-manager/render/tabs/webhook.js';
import { renderSlackbot } from '../../src/org-manager/render/tabs/slackbot.js';
import { renderMembers } from '../../src/org-manager/render/tabs/members.js';
import { renderLeagueEditor } from '../../src/org-manager/render/tabs/league-editor.js';
import { renderRacing } from '../../src/org-manager/render/tabs/racing.js';

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); });

describe('renderLogin', () => {
  it('shows the CLI instruction', () => {
    renderLogin(root);
    expect(root.textContent).toContain('token-derby web');
  });
});

describe('renderSidebar', () => {
  it('lists orgs with owner/member pills and fires onSelect', () => {
    const onSelect = vi.fn();
    renderSidebar(root, {
      orgs: [{ org_id: 'o1', org_name: 'Acme' }],
      selected: 'Acme', ownerOrgs: new Set(['Acme']),
      onSelect, onCreate: vi.fn(), onJoin: vi.fn(), onLogout: vi.fn(),
    });
    expect(root.textContent).toContain('Acme');
    expect(root.textContent.toLowerCase()).toContain('owner');
    (root.querySelector('[data-org="Acme"]') as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith('Acme');
  });
});

describe('renderOverview', () => {
  it('renders the join token and creator', () => {
    renderOverview(root, {
      org: { org_id: 'o1', org_name: 'Acme', org_join_token: 'JOIN-XYZ',
        created_at: '2026-05-14T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar' },
    });
    expect(root.textContent).toContain('JOIN-XYZ');
    expect(root.textContent).toContain('omar');
  });
});

describe('renderSchedule', () => {
  it('hides Save/Clear for non-owners', () => {
    renderSchedule(root, { schedule: null, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeNull();
  });
  it('shows Save for owners', () => {
    renderSchedule(root, { schedule: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeTruthy();
  });
  it('preserves a pre-set stamina flag through a save from this tab', () => {
    const onSave = vi.fn();
    const schedule = {
      org_id: 'o1', weekdays: [1, 2], start_local: '09:00', end_local: '17:30', tz: 'Europe/London',
      created_at: '2026-01-01T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar',
      stamina: true,
    };
    renderSchedule(root, { schedule, isOwner: true, onSave, onClear: vi.fn() });
    (root.querySelector('[data-action="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].stamina).toBe(true);
  });
});

describe('renderWebhook', () => {
  it('hides Save/Clear for non-owners', () => {
    renderWebhook(root, { webhook: null, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeNull();
    expect(root.querySelector('button[data-action="clear"]')).toBeNull();
  });
  it('shows Save/Clear for owners', () => {
    renderWebhook(root, { webhook: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeTruthy();
    expect(root.querySelector('button[data-action="clear"]')).toBeTruthy();
  });
});

describe('renderSlackbot', () => {
  it('renders five message checkboxes, digest controls, and Save/Clear for owners', () => {
    renderSlackbot(root, {
      slack: {
        configured: true,
        channel_id: 'C0123',
        messages: { race_created: true, race_ended: true, league_season_ended: false, weekly_digest: true, release_published: false },
        digest: { weekday: 5, time_local: '15:00', tz: 'Europe/London' },
      },
      isOwner: true,
      onSave: vi.fn(),
      onClear: vi.fn(),
    });
    expect(root.querySelectorAll('input[name="msg"]').length).toBe(5);
    expect(root.querySelector<HTMLInputElement>('input[name="bot_token"]')!.placeholder).toMatch(/configured/i);
    expect(root.querySelector('select[name="weekday"]')).toBeTruthy();
    expect(root.querySelector('input[name="time_local"]')).toBeTruthy();
    expect(root.querySelector('input[name="tz"]')).toBeTruthy();
    expect(root.querySelector('button[data-action="save"]')).toBeTruthy();
    expect(root.querySelector('button[data-action="clear"]')).toBeTruthy();
  });

  it('hides Save/Clear and disables inputs for non-owners', () => {
    renderSlackbot(root, { slack: null, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeNull();
    expect(root.querySelector('button[data-action="clear"]')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('input[name="bot_token"]')!.disabled).toBe(true);
  });

  it('omits bot_token from the saved body when the token field is left blank, but includes it when filled', () => {
    const onSave = vi.fn();
    renderSlackbot(root, {
      slack: {
        configured: true,
        channel_id: 'C0123',
        messages: { race_created: true, race_ended: true, league_season_ended: false, weekly_digest: true, release_published: false },
        digest: { weekday: 5, time_local: '15:00', tz: 'Europe/London' },
      },
      isOwner: true,
      onSave,
      onClear: vi.fn(),
    });

    // Leave the bot-token field blank.
    (root.querySelector('[data-action="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
    const blankBody = onSave.mock.calls[0]![0];
    expect('bot_token' in blankBody).toBe(false);

    // Fill in the bot-token field.
    root.querySelector<HTMLInputElement>('input[name="bot_token"]')!.value = 'xoxb-new-token';
    (root.querySelector('[data-action="save"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(2);
    const filledBody = onSave.mock.calls[1]![0];
    expect('bot_token' in filledBody).toBe(true);
    expect(filledBody.bot_token).toBe('xoxb-new-token');
  });
});

describe('renderMembers', () => {
  it('renders member names and escapes a name containing <', () => {
    renderMembers(root, {
      members: [
        { user_id: 'u1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'u2', user_name: '<script>evil</script>', joined_at: '2026-05-15T00:00:00Z' },
      ],
    });
    expect(root.textContent).toContain('omar');
    expect(root.innerHTML).not.toContain('<script>evil</script>');
    expect(root.innerHTML).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });
});

describe('renderLeagueEditor', () => {
  const twoDivLeague = {
    org_id: 'o1',
    divisions: [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }],
    boundaries: [2],
    races_per_season: 8, weekdays: [1, 2, 3], start_local: '09:00', end_local: '17:30',
    tz: 'Europe/London', current_season: 1, status: 'active' as const,
    created_at: '2026-01-01T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar',
  };

  it('hides Save/Delete and disables inputs for non-owners', () => {
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('[data-action="save-league"]')).toBeNull();
    expect(root.querySelector('input.org-div-name')).toBeTruthy();
    expect(root.querySelector<HTMLInputElement>('input.org-div-name')!.disabled).toBe(true);
  });

  it('pre-fills a default two-division config when there is no league', () => {
    renderLeagueEditor(root, { league: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    const names = Array.from(root.querySelectorAll<HTMLInputElement>('input.org-div-name'));
    expect(names.length).toBe(2);
    expect(names[0]!.value).toBe('Division 1');
    // last division has no cap field (overflow), earlier ones do
    expect(root.querySelectorAll('.org-div-cap').length).toBe(1);
    expect(root.querySelector('.org-div-overflow')).toBeTruthy();
  });

  it('adds a pre-filled division (name + cap for the new non-last row + a new swap)', () => {
    renderLeagueEditor(root, { league: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    (root.querySelector('[data-action="add-division"]') as HTMLElement).click();
    const names = Array.from(root.querySelectorAll<HTMLInputElement>('input.org-div-name'));
    expect(names.length).toBe(3);
    expect(names[2]!.value).toBe('Division 3');
    expect(root.querySelectorAll('.org-div-cap').length).toBe(2); // divisions 1 & 2 now capped; 3 = overflow
    expect(root.querySelectorAll('.org-div-swapn').length).toBe(2); // two boundaries
  });

  it('removes a division and its adjacent boundary', () => {
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    (root.querySelector('[data-action="add-division"]') as HTMLElement).click(); // now 3 divisions, 2 boundaries
    (root.querySelectorAll('.org-div-remove')[1] as HTMLElement).click();          // remove division 2
    expect(root.querySelectorAll('input.org-div-name').length).toBe(2);
    expect(root.querySelectorAll('.org-div-swapn').length).toBe(1);
  });

  it('builds a valid SetOrgLeagueRequest and calls onSave', () => {
    const onSave = vi.fn();
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave, onClear: vi.fn() });
    (root.querySelector('[data-action="save-league"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
    const body = onSave.mock.calls[0]![0];
    expect(body.divisions.map((d: { name: string }) => d.name)).toEqual(['Premier', 'Championship']);
    expect(body.boundaries).toEqual([2]);
    expect(body.races_per_season).toBe(8);
    expect(body.weekdays).toEqual([1, 2, 3]);
    expect(body.tz).toBe('Europe/London');
  });

  it('rejects an invalid config (swap exceeds the higher cap) without calling onSave', () => {
    const onSave = vi.fn();
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave, onClear: vi.fn() });
    const swap = root.querySelector<HTMLInputElement>('.org-div-swapn')!;
    swap.value = '99'; // > Premier cap 8
    (root.querySelector('[data-action="save-league"]') as HTMLElement).click();
    expect(onSave).not.toHaveBeenCalled();
    expect(root.querySelector('.org-error')!.textContent).toMatch(/cap|swap|boundary/i);
  });

  it('rejects an empty division name without calling onSave', () => {
    const onSave = vi.fn();
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave, onClear: vi.fn() });
    root.querySelector<HTMLInputElement>('input.org-div-name')!.value = '   ';
    (root.querySelector('[data-action="save-league"]') as HTMLElement).click();
    expect(onSave).not.toHaveBeenCalled();
    expect(root.querySelector('.org-error')!.textContent).toMatch(/name/i);
  });

  it('escapes a division name containing markup (renders it as data, not an element)', () => {
    const league = { ...twoDivLeague, divisions: [{ name: '<b>x</b>', cap: 8 }, { name: 'B', cap: 8 }] };
    renderLeagueEditor(root, { league, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    // No <b> element is ever created — the name lives safely as an input value (data).
    expect(root.querySelector('.org-divisions b')).toBeNull();
    expect(root.querySelector<HTMLInputElement>('input.org-div-name')!.value).toBe('<b>x</b>');
  });

  it('escapes a division name containing a quote (no attribute breakout)', () => {
    const league = { ...twoDivLeague, divisions: [{ name: 'a" onmouseover="x', cap: 8 }, { name: 'B', cap: 8 }] };
    renderLeagueEditor(root, { league, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    const nameEl = root.querySelector<HTMLInputElement>('input.org-div-name')!;
    expect(nameEl.value).toBe('a" onmouseover="x');       // preserved as data
    expect(nameEl.getAttribute('onmouseover')).toBeNull(); // did not break out into a new attribute
  });

  it('shows a placeholder (not NaN) in the summary when a cap is cleared', () => {
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    const cap = root.querySelector<HTMLInputElement>('.org-div-cap input')!;
    cap.value = '';
    cap.dispatchEvent(new Event('input', { bubbles: true }));
    const summary = root.querySelector('.org-div-summary')!.textContent!;
    expect(summary).not.toMatch(/NaN/);
    expect(summary).toContain('?');
  });

  it('fires onClear from the Delete button', () => {
    const onClear = vi.fn();
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave: vi.fn(), onClear });
    (root.querySelector('[data-action="delete-league"]') as HTMLElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('preserves a pre-set stamina flag through a save from this tab', () => {
    const onSave = vi.fn();
    renderLeagueEditor(root, { league: { ...twoDivLeague, stamina: true }, isOwner: true, onSave, onClear: vi.fn() });
    (root.querySelector('[data-action="save-league"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].stamina).toBe(true);
  });

  it('notes that shape changes apply next season when editing an existing league', () => {
    renderLeagueEditor(root, { league: twoDivLeague, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('.org-div-note')!.textContent).toMatch(/next season/i);
  });
  it('omits the next-season note when creating a new league', () => {
    renderLeagueEditor(root, { league: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('.org-div-note')).toBeNull();
  });
});

describe('renderRacing', () => {
  const league = {
    org_id: 'o1', divisions: [{ name: 'A', cap: 8 }, { name: 'B', cap: 8 }], boundaries: [2],
    races_per_season: 8, weekdays: [1], start_local: '09:00', end_local: '17:30', tz: 'Europe/London',
    current_season: 1, status: 'active' as const, created_at: '2026-01-01T00:00:00Z',
    creator_user_id: 'u1', creator_user_name: 'omar',
  };
  const schedule = {
    org_id: 'o1', weekdays: [1, 2], start_local: '09:00', end_local: '17:30', tz: 'Europe/London',
    created_at: '2026-01-01T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar',
  };
  const noop = { onSaveSchedule: vi.fn(), onClearSchedule: vi.fn(), onSaveLeague: vi.fn(), onClearLeague: vi.fn() };

  it('offers three modes and defaults to Off when nothing is configured', () => {
    renderRacing(root, { schedule: null, league: null, isOwner: true, ...noop });
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="racing-mode"]'));
    expect(radios.map((r) => r.value)).toEqual(['off', 'scheduled', 'league']);
    expect(radios.find((r) => r.checked)!.value).toBe('off');
  });

  it('defaults to League mode and shows the league editor when a league exists', () => {
    renderRacing(root, { schedule: null, league, isOwner: true, ...noop });
    expect(root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="league"]')!.checked).toBe(true);
    expect(root.querySelector('[data-action="save-league"]')).toBeTruthy();
  });

  it('defaults to Scheduled mode and shows the schedule form when a schedule exists', () => {
    renderRacing(root, { schedule, league: null, isOwner: true, ...noop });
    expect(root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="scheduled"]')!.checked).toBe(true);
    expect(root.querySelector('[data-action="save"]')).toBeTruthy(); // renderSchedule's Save button
  });

  it('switches the body when a mode radio is selected', () => {
    renderRacing(root, { schedule: null, league: null, isOwner: true, ...noop });
    const leagueRadio = root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="league"]')!;
    leagueRadio.checked = true;
    leagueRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('[data-action="save-league"]')).toBeTruthy();
  });

  it('warns that switching will replace the other mode', () => {
    renderRacing(root, { schedule, league: null, isOwner: true, ...noop });
    const leagueRadio = root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="league"]')!;
    leagueRadio.checked = true;
    leagueRadio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('.org-racing-warn')!.textContent).toMatch(/schedule/i);
  });

  it('disables the mode radios for non-owners', () => {
    renderRacing(root, { schedule: null, league, isOwner: false, ...noop });
    expect(root.querySelector<HTMLInputElement>('input[name="racing-mode"]')!.disabled).toBe(true);
    expect(root.querySelector('[data-action="save-league"]')).toBeNull();
  });

  it('turns racing off via the Turn off button, clearing whichever is configured', () => {
    const onClearLeague = vi.fn();
    renderRacing(root, { schedule: null, league, isOwner: true, ...noop, onClearLeague });
    const offRadio = root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="off"]')!;
    offRadio.checked = true;
    offRadio.dispatchEvent(new Event('change', { bubbles: true }));
    (root.querySelector('[data-action="turn-off"]') as HTMLElement).click();
    expect(onClearLeague).toHaveBeenCalledTimes(1);
  });

  it('does not leak the league summary listener onto the schedule form after switching modes', () => {
    renderRacing(root, { schedule: null, league, isOwner: true, ...noop });
    // Switch League -> Scheduled (renderSchedule replaces the body's innerHTML).
    const schedRadio = root.querySelector<HTMLInputElement>('input[name="racing-mode"][value="scheduled"]')!;
    schedRadio.checked = true;
    schedRadio.dispatchEvent(new Event('change', { bubbles: true }));
    const start = root.querySelector<HTMLInputElement>('input[name="start"]')!;
    // Typing into the schedule form must not throw (previously: stale summary listener threw).
    expect(() => { start.value = '08:00'; start.dispatchEvent(new Event('input', { bubbles: true })); }).not.toThrow();
  });
});
