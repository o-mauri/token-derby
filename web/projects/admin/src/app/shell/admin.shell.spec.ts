import { ADMIN_KEYS } from '../session/admin-session';
import { ORGS, USERS } from '../testing/fixtures';
import { openAdmin } from '../testing/harness';

const tabs = (el: HTMLElement) => [...el.querySelectorAll('td-tabs a')].map((a) => a.textContent?.trim());
const crumbs = (el: HTMLElement) => [...el.querySelectorAll('td-crumbs .part')].map((p) => p.textContent?.trim());

describe('Admin shell', () => {
  it('shows the section in the breadcrumb, and tab counts once each list loads', async () => {
    const p = await openAdmin('/users');
    expect(crumbs(p.el())).toEqual(['Admin', 'Users']);
    expect(tabs(p.el())).toEqual(['Users', 'Organisations', 'Claims']);
    p.http.expectOne('/api/admin/users').flush({ users: USERS });
    p.http.expectOne('/api/admin/organisations').flush({ organisations: ORGS });
    await p.settle();
    expect(tabs(p.el())).toEqual(['Users · 2', 'Organisations · 1', 'Claims']);
  });

  it('signs out to the login page', async () => {
    const p = await openAdmin('/users');
    await p.click('button.signout');
    expect(p.storage.getItem(ADMIN_KEYS.token)).toBeNull();
    expect(p.router().url).toBe('/login');
  });
});
