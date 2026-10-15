import type { OrgMembersResponse } from '@token-derby/shared';
import { openSettings, orgRecord } from './settings-test-kit';

const MEMBERS: OrgMembersResponse = { members: [
  { user_id: 'u1', user_name: 'Omar', joined_at: '2026-05-14T10:00:00Z', linked_email: true, matches_domain: 'yes' },
  { user_id: 'u2', user_name: 'Dana', joined_at: '2026-06-02T10:00:00Z', linked_email: true, matches_domain: 'no' },
  { user_id: 'u3', user_name: 'Sam', joined_at: '2026-06-09T10:00:00Z', linked_email: false, matches_domain: 'n/a' },
] };

async function members() {
  const s = await openSettings('/org/Acme/settings');
  await s.answerOrg();
  s.http.expectOne('/api/organisations/Acme/members').flush(MEMBERS);
  await s.settle();
  return s;
}

describe('Members tab', () => {
  it('lists members with the owner marked and no Remove for them', async () => {
    const s = await members();
    expect(s.el().querySelector('.count')?.textContent?.trim()).toBe('3 MEMBERS');
    const rows = [...s.el().querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.querySelector('.owner')?.textContent?.trim()).toBe('owner');
    expect(rows[0]!.querySelector('button.remove')).toBeNull();
    expect(rows[1]!.querySelector('button.remove')).not.toBeNull();
  });

  it('marks whether each email matches the domain, out loud too', async () => {
    const s = await members();
    const marks = [...s.el().querySelectorAll('.match')].map((m) => [m.textContent?.trim(), m.getAttribute('aria-label')]);
    expect(marks).toEqual([['✓', 'Email matches domain'], ['✗', "Doesn't match"], ['–', 'No domain set']]);
  });

  it('removes a member after confirming, warning that they can rejoin by domain', async () => {
    const s = await members();
    await s.click('button.remove', 0);
    expect(s.el().querySelector('td-confirm .box')?.textContent).toContain('so they can rejoin automatically');
    await s.click('td-confirm button.confirm');
    const req = s.http.expectOne('/api/organisations/Acme/members/u2');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });
    await s.settle();
    expect(s.el().querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('says why a removal was refused', async () => {
    const s = await members();
    await s.click('button.remove', 0);
    await s.click('td-confirm button.confirm');
    s.http.expectOne('/api/organisations/Acme/members/u2').flush({ code: 'CANNOT_REMOVE_OWNER', message: 'x' }, { status: 409, statusText: 'x' });
    await s.settle();
    expect(s.el().querySelector('.error')?.textContent?.trim()).toBe("The owner can't be removed.");
  });
});

async function access() {
  const s = await openSettings('/org/Acme/settings/access');
  await s.answerOrg();
  return s;
}

describe('Access tab', () => {
  it('shows the join token to copy', async () => {
    const s = await access();
    expect(s.el().querySelector('td-copy-field')?.textContent).toContain('td_join_abc');
  });

  it('rotates the token after confirming', async () => {
    const s = await access();
    await s.click('button.rotate');
    await s.click('td-confirm button.confirm');
    s.http.expectOne('/api/organisations/Acme/join-token/rotate').flush({ org_join_token: 'td_join_new' });
    await s.settle();
    expect(s.el().querySelector('td-copy-field')?.textContent).toContain('td_join_new');
    expect(s.el().querySelector('.rotated')?.textContent).toContain('The old one no longer works.');
  });

  it('saves a switch straight away with the whole settings', async () => {
    const s = await access();
    await s.click('td-toggle.domain-join button');
    const req = s.http.expectOne('/api/organisations/Acme/access');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ allowed_domains: ['acme.com'], join_token_enabled: true, domain_join_enabled: false, restrict_to_allowed_domains: false });
    req.flush({ access: req.request.body });
    await s.settle();
    expect(s.el().querySelector('td-toggle.domain-join button')?.getAttribute('aria-checked')).toBe('false');
  });

  it('puts a refused switch back and says why', async () => {
    const s = await access();
    await s.click('td-toggle.restrict button');
    s.http.expectOne('/api/organisations/Acme/access').flush({ code: 'ALLOW_LIST_REQUIRED', message: 'x' }, { status: 400, statusText: 'x' });
    await s.settle();
    expect(s.el().querySelector('td-toggle.restrict button')?.getAttribute('aria-checked')).toBe('false');
    expect(s.el().querySelector('.error')?.textContent?.trim()).toBe('Add at least one domain before requiring one.');
  });

  it('reloads after someone else changed the settings, showing their values', async () => {
    const s = await access();
    await s.click('td-toggle.token button');
    s.http.expectOne('/api/organisations/Acme/access').flush({ code: 'ACCESS_CONFLICT', message: 'x' }, { status: 409, statusText: 'x' });
    await s.settle();
    s.http.expectOne('/api/organisations/Acme').flush(orgRecord({ access: { allowed_domains: ['acme.com'], join_token_enabled: false, domain_join_enabled: true, restrict_to_allowed_domains: true } }));
    await s.settle();
    expect(s.el().querySelector('td-toggle.token button')?.getAttribute('aria-checked')).toBe('false');
    expect(s.el().querySelector('td-toggle.restrict button')?.getAttribute('aria-checked')).toBe('true');
  });

  it('saves domains on demand, asking before leaving them unsaved', async () => {
    const s = await access();
    const box = s.el().querySelector<HTMLInputElement>('td-domain-list input.add')!;
    box.value = 'example.com';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await s.settle();
    void s.router().navigateByUrl('/org/Acme/settings');
    await s.render();
    expect(s.el().querySelector('td-confirm .box')?.textContent).toContain('Your changes to Access will be lost.');
    await s.click('td-confirm button.cancel');
    await s.click('button.save-domains');
    const req = s.http.expectOne('/api/organisations/Acme/access');
    expect(req.request.body.allowed_domains).toEqual(['acme.com', 'example.com']);
    req.flush({ access: req.request.body });
    await s.settle();
    void s.router().navigateByUrl('/org/Acme/settings');
    await s.settle();
    expect(s.router().url).toBe('/org/Acme/settings');
  });
});
