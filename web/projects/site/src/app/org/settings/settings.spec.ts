import { TestBed } from '@angular/core/testing';
import { DraftRegistry } from './drafts';
import { openSettings, orgRecord } from './settings-test-kit';

describe('Settings button on the dashboard', () => {
  it('shows for the owner', async () => {
    const s = await openSettings('/org/Acme');
    await s.answerOrg();
    expect(s.el().querySelector('a.settings')?.getAttribute('href')).toBe('/org/Acme/settings');
  });

  it('hides for a member who is not the owner', async () => {
    const s = await openSettings('/org/Acme');
    await s.answerOrg(orgRecord({ creator_user_id: 'u9' }));
    expect(s.el().querySelector('a.settings')).toBeNull();
  });

  it('hides for someone outside the org', async () => {
    const s = await openSettings('/org/Acme');
    await s.answerOrg({ status: 403, code: 'NOT_ORG_MEMBER' });
    expect(s.el().querySelector('a.settings')).toBeNull();
  });

  it('asks nothing when signed out', async () => {
    const s = await openSettings('/org/Acme', {});
    s.quiet();
    await s.settle();
    s.http.expectNone('/api/organisations/Acme');
    expect(s.el().querySelector('a.settings')).toBeNull();
  });
});

describe('Settings page', () => {
  it('opens on Members for the owner, with five tabs and a way back', async () => {
    const s = await openSettings('/org/Acme/settings');
    await s.answerOrg();
    s.http.match((r) => r.url.startsWith('/api/organisations/Acme/')).forEach((r) => r.flush({ members: [] }));
    await s.settle();
    expect([...s.el().querySelectorAll('td-tabs a.tab')].map((a) => a.textContent?.trim())).toEqual(['Members', 'Access', 'Racing', 'Race settings', 'Notifications']);
    expect(s.el().querySelector('td-tabs a.on')?.textContent?.trim()).toBe('Members');
    expect(s.el().querySelector('td-crumbs a.org-name')?.getAttribute('href')).toBe('/org/Acme');
    expect(s.el().querySelector('td-crumbs .here')?.textContent?.trim()).toBe('Settings');
  });

  it('turns away someone who is not the owner', async () => {
    const s = await openSettings('/org/Acme/settings');
    await s.answerOrg(orgRecord({ creator_user_id: 'u9' }));
    expect(s.el().querySelector('.message')?.textContent).toContain('Only the owner of Acme can change its settings.');
    expect(s.el().querySelector('td-tabs')).toBeNull();
  });

  it('asks you to sign in, coming back to settings', async () => {
    const s = await openSettings('/org/Acme/settings', {});
    s.quiet();
    await s.settle();
    expect(s.el().querySelector('td-google-button a')?.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2Forg%2FAcme%2Fsettings');
  });

  it('asks before leaving unsaved changes, and stays on Stay', async () => {
    const s = await openSettings('/org/Acme/settings');
    await s.answerOrg();
    s.http.match(() => true).forEach((r) => r.flush({ members: [] }));
    await s.settle();
    const drafts = TestBed.inject(DraftRegistry);
    drafts.set('Members', true);
    void s.router().navigateByUrl('/org/Acme/settings/access');
    await s.render();
    expect(s.el().querySelector('td-confirm .box')?.textContent).toContain('Your changes to Members will be lost.');
    await s.click('td-confirm button.cancel');
    expect(s.router().url).toBe('/org/Acme/settings');
  });

  it('leaves on Leave, and stops asking once nothing is unsaved', async () => {
    const s = await openSettings('/org/Acme/settings');
    await s.answerOrg();
    s.http.match(() => true).forEach((r) => r.flush({ members: [] }));
    await s.settle();
    const drafts = TestBed.inject(DraftRegistry);
    drafts.set('Members', true);
    void s.router().navigateByUrl('/org/Acme/settings/access');
    await s.render();
    await s.click('td-confirm button.confirm');
    expect(s.router().url).toBe('/org/Acme/settings/access');
    drafts.set('Members', false);
    void s.router().navigateByUrl('/org/Acme/settings/racing');
    await s.settle();
    expect(s.router().url).toBe('/org/Acme/settings/racing');
  });
});
