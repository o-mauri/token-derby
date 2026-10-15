import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrors } from '@token-derby/ui';
import { USERS } from '../testing/fixtures';
import { AdminData } from './admin-data';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([apiErrors])), provideHttpClientTesting()] });
  return { data: TestBed.inject(AdminData), http: TestBed.inject(HttpTestingController) };
}

describe('AdminData', () => {
  it('loads the users once however often they are asked for', async () => {
    const { data, http } = setup();
    data.ensureUsers();
    data.ensureUsers();
    expect(data.users.status()).toBe('loading');
    http.expectOne('/api/admin/users').flush({ users: USERS });
    await tick();
    data.ensureUsers();
    http.expectNone('/api/admin/users');
    expect(data.users.status()).toBe('ready');
    expect(data.users.value()?.users.length).toBe(2);
  });

  it('finds a user and patches it in place', async () => {
    const { data, http } = setup();
    data.ensureUsers();
    http.expectOne('/api/admin/users').flush({ users: USERS });
    await tick();
    const dana = data.userById(() => 'u2');
    expect(dana()?.display_name).toBe('dana');
    data.patchUser('u2', (u) => ({ ...u, display_name: 'Dana' }));
    expect(dana()?.display_name).toBe('Dana');
  });

  it('reports a failed load, and loads again on reload', async () => {
    const { data, http } = setup();
    data.ensureOrgs();
    http.expectOne('/api/admin/organisations').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Err' });
    await tick();
    expect(data.orgs.status()).toBe('error');
    data.orgs.reload();
    http.expectOne('/api/admin/organisations').flush({ organisations: [] });
    await tick();
    expect(data.orgs.status()).toBe('ready');
  });
});
