import type { League } from '@token-derby/shared';
import { openSettings } from './settings-test-kit';

async function access() {
  const s = await openSettings('/org/Acme/settings/access');
  await s.answerOrg();
  return s;
}

describe('review fixes: Access', () => {
  it('keeps a saved switch after visiting another tab', async () => {
    const s = await access();
    await s.click('td-toggle.domain-join button');
    const req = s.http.expectOne('/api/organisations/Acme/access');
    req.flush({ access: req.request.body });
    await s.settle();
    await s.router().navigateByUrl('/org/Acme/settings');
    await s.settle();
    s.http.match('/api/organisations/Acme/members').forEach((r) => r.flush({ members: [] }));
    await s.router().navigateByUrl('/org/Acme/settings/access');
    await s.settle();
    expect(s.el().querySelector('td-toggle.domain-join button')?.getAttribute('aria-checked')).toBe('false');
  });

  it('keeps a rotated token after visiting another tab', async () => {
    const s = await access();
    await s.click('button.rotate');
    await s.click('td-confirm button.confirm');
    s.http.expectOne('/api/organisations/Acme/join-token/rotate').flush({ org_join_token: 'td_join_new' });
    await s.settle();
    await s.router().navigateByUrl('/org/Acme/settings');
    await s.settle();
    s.http.match('/api/organisations/Acme/members').forEach((r) => r.flush({ members: [] }));
    await s.router().navigateByUrl('/org/Acme/settings/access');
    await s.settle();
    expect(s.el().querySelector('td-copy-field')?.textContent).toContain('td_join_new');
  });

  it('sends unsaved domains with a switch, and keeps them shown', async () => {
    const s = await access();
    const box = s.el().querySelector<HTMLInputElement>('td-domain-list input.add')!;
    box.value = 'new.io';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await s.settle();
    await s.click('td-toggle.restrict button');
    const req = s.http.expectOne('/api/organisations/Acme/access');
    expect(req.request.body.allowed_domains).toEqual(['acme.com', 'new.io']);
    req.flush({ access: req.request.body });
    await s.settle();
    expect([...s.el().querySelectorAll('td-domain-list .chip')].map((c) => c.textContent?.replace('✕', '').trim())).toEqual(['acme.com', 'new.io']);
  });

  it('builds a second quick flip on the first, not on the stale server value', async () => {
    const s = await access();
    await s.click('td-toggle.token button');
    expect(s.el().querySelector<HTMLButtonElement>('td-toggle.domain-join button')!.disabled).toBe(true);
    const first = s.http.expectOne('/api/organisations/Acme/access');
    first.flush({ access: first.request.body });
    await s.settle();
    await s.click('td-toggle.domain-join button');
    expect(s.http.expectOne('/api/organisations/Acme/access').request.body).toMatchObject({ join_token_enabled: false, domain_join_enabled: false });
  });

  it('keeps the page when a background reload fails', async () => {
    const s = await access();
    await s.click('td-toggle.token button');
    s.http.expectOne('/api/organisations/Acme/access').flush({ code: 'ACCESS_CONFLICT', message: 'x' }, { status: 409, statusText: 'x' });
    await s.settle();
    s.http.expectOne('/api/organisations/Acme').error(new ProgressEvent('error'));
    await s.settle();
    expect(s.el().querySelector('td-tabs')).not.toBeNull();
  });
});

describe('review fixes: loads that fail', () => {
  it('race settings shows no form when it could not load', async () => {
    const s = await openSettings('/org/Acme/settings/race-settings');
    await s.answerOrg();
    s.http.expectOne('/api/organisations/Acme/race-settings').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'x' });
    await s.settle();
    expect(s.el().querySelector('td-modifier-card')).toBeNull();
    expect(s.el().querySelector('.failed')?.textContent).toContain("Couldn't load");
  });

  it('notifications shows no form when it could not load', async () => {
    const s = await openSettings('/org/Acme/settings/notifications');
    await s.answerOrg();
    s.http.expectOne('/api/organisations/Acme/webhook').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'x' });
    s.http.match('/api/organisations/Acme/slack').forEach((r) => r.flush({ configured: false, channel_id: null, messages: null, digest: null }));
    await s.settle();
    expect(s.el().querySelector('button.save-webhook')).toBeNull();
    expect(s.el().querySelector('.failed')?.textContent).toContain("Couldn't load");
  });
});

const stamp = { org_id: 'o', created_at: '', creator_user_id: 'u1', creator_user_name: 'Omar' };
const LEAGUE = {
  weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London', ...stamp,
  divisions: [{ name: 'Premier', cap: 8 }, { name: 'Two', cap: 8 }], boundaries: [2], races_per_season: 10, current_season: 2, status: 'active',
} as League;

async function racing(league: League | null) {
  const s = await openSettings('/org/Acme/settings/racing');
  await s.answerOrg();
  s.http.expectOne('/api/organisations/Acme/schedule').flush({ schedule: null });
  s.http.expectOne('/api/organisations/Acme/league').flush({ league });
  await s.settle();
  return s;
}

describe('review fixes: Racing', () => {
  it('says the old mode is gone when the new one failed to save', async () => {
    const s = await racing(LEAGUE);
    [...s.el().querySelectorAll<HTMLElement>('td-segmented .segment')].find((x) => x.textContent?.trim() === 'Weekly schedule')!.click();
    await s.settle();
    await s.click('button.save-schedule');
    await s.click('td-confirm button.confirm');
    s.http.expectOne('/api/organisations/Acme/league').flush({ ok: true });
    await s.settle();
    s.http.expectOne('/api/organisations/Acme/schedule').flush({ code: 'BAD_REQUEST', message: 'tz bad' }, { status: 400, statusText: 'x' });
    await s.settle();
    s.http.expectOne('/api/organisations/Acme/schedule').flush({ schedule: null });
    s.http.expectOne('/api/organisations/Acme/league').flush({ league: null });
    await s.settle();
    expect(s.el().querySelector('.mode-lost')?.textContent).toContain("Acme's league was removed; racing is off until this saves.");
  });

  it('opens on edits waiting for next season and says so', async () => {
    const s = await racing({ ...LEAGUE, pending_structural: { divisions: [{ name: 'Only', cap: 9 }], boundaries: [] } });
    expect(s.el().querySelectorAll('td-division-ladder .division')).toHaveLength(1);
    expect(s.el().querySelector('.next-season')?.textContent).toContain('take effect next season');
  });

  it('lets a number box be cleared and retyped', async () => {
    const s = await racing(LEAGUE);
    const cap = s.el().querySelector('td-division-ladder td-text-input.cap input') as HTMLInputElement;
    cap.value = '';
    cap.dispatchEvent(new Event('input'));
    await s.settle();
    expect(cap.value).toBe('');
    expect(s.el().querySelector('.error')?.textContent).toContain('cap');
    cap.value = '10';
    cap.dispatchEvent(new Event('input'));
    await s.settle();
    expect(s.el().querySelector('.error')).toBeNull();
  });
});
