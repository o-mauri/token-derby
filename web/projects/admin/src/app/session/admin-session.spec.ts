import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { apiErrors } from '@token-derby/ui';
import { MemoryStorage } from '../testing/memory-storage';
import { ADMIN_KEYS, ADMIN_STORAGE, AdminSession, safeReturnTo } from './admin-session';
import { adminAuth, adminGuard } from './admin-auth';

@Component({ selector: 'admin-stub', template: 'stub' })
class Stub {}

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();

function setup(seed: Record<string, string> = {}) {
  const storage = new MemoryStorage(seed);
  TestBed.configureTestingModule({
    providers: [
      { provide: ADMIN_STORAGE, useValue: storage },
      provideHttpClient(withInterceptors([adminAuth, apiErrors])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'login', component: Stub },
        { path: 'users', component: Stub, canActivate: [adminGuard] },
        { path: 'users/:id', component: Stub, canActivate: [adminGuard] },
      ]),
    ],
  });
  return { storage, session: () => TestBed.inject(AdminSession), http: TestBed.inject(HttpTestingController), client: () => TestBed.inject(HttpClient) };
}

describe('AdminSession', () => {
  it('reads a stored token', () => {
    const { session } = setup({ [ADMIN_KEYS.token]: 't', [ADMIN_KEYS.expires]: future() });
    expect(session().token()).toBe('t');
    expect(session().signedIn()).toBe(true);
  });

  it('treats an expired token as signed out and forgets it', () => {
    const { session, storage } = setup({ [ADMIN_KEYS.token]: 't', [ADMIN_KEYS.expires]: past() });
    expect(session().signedIn()).toBe(false);
    expect(storage.length).toBe(0);
  });

  it('keeps an old-admin token that has no expiry', () => {
    const { session } = setup({ [ADMIN_KEYS.token]: 't' });
    expect(session().signedIn()).toBe(true);
  });

  it('stores and clears a sign-in', () => {
    const { session, storage } = setup();
    const expires_at = future();
    session().set({ token: 'new', expires_at });
    expect(storage.getItem(ADMIN_KEYS.token)).toBe('new');
    expect(storage.getItem(ADMIN_KEYS.expires)).toBe(expires_at);
    session().clear();
    expect(storage.length).toBe(0);
    expect(session().signedIn()).toBe(false);
  });
});

describe('safeReturnTo', () => {
  it.each([['//evil.com'], ['https://x.test/'], ['/\\evil'], [null], [undefined], [''], ['users']])('refuses %s', (raw) => {
    expect(safeReturnTo(raw)).toBe('/users');
  });
  it('keeps an in-app path', () => expect(safeReturnTo('/users/u1')).toBe('/users/u1'));
});

describe('adminAuth', () => {
  it('adds the token to admin requests', async () => {
    const { http, client } = setup({ [ADMIN_KEYS.token]: 't' });
    const done = firstValueFrom(client().get('/api/admin/users'));
    const req = http.expectOne('/api/admin/users');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t');
    req.flush({ users: [] });
    await done;
  });

  it('leaves the login request alone', async () => {
    const { http, client } = setup({ [ADMIN_KEYS.token]: 't' });
    const done = firstValueFrom(client().post('/api/admin/login', {}));
    const req = http.expectOne('/api/admin/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ token: 'x', expires_at: future() });
    await done;
  });

  it('signs out on a 401, sending you to login once with where you were', async () => {
    const { http, client, session } = setup({ [ADMIN_KEYS.token]: 't' });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/users/u1');
    const nav = vi.spyOn(router, 'navigateByUrl');
    const a = firstValueFrom(client().get('/api/admin/users')).catch(() => undefined);
    const b = firstValueFrom(client().get('/api/admin/organisations')).catch(() => undefined);
    http.expectOne('/api/admin/users').flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' });
    http.expectOne('/api/admin/organisations').flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' });
    await Promise.all([a, b]);
    expect(session().signedIn()).toBe(false);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(String(nav.mock.calls[0]![0])).toBe('/login?return_to=%2Fusers%2Fu1');
  });
});

describe('adminGuard', () => {
  it('sends a signed-out visitor to login, remembering the page', async () => {
    setup();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users');
    expect(TestBed.inject(Router).url).toBe('/login?return_to=%2Fusers');
  });

  it('lets a signed-in admin through', async () => {
    setup({ [ADMIN_KEYS.token]: 't' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users');
    expect(TestBed.inject(Router).url).toBe('/users');
  });
});

describe('signing in again', () => {
  it('loads the lists afresh after a 401 and a new sign-in', async () => {
    const { openAdmin } = await import('../testing/harness');
    const { answerLists } = await import('../testing/answer');
    TestBed.resetTestingModule();
    const p = await openAdmin('/users');
    p.http.expectOne('/api/admin/users').flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' });
    p.http.match('/api/admin/organisations').forEach((r) => r.flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' }));
    await p.settle();
    expect(p.router().url).toBe('/login?return_to=%2Fusers');
    for (const [label, value] of [['Username', 'admin'], ['Password', 'pw']]) {
      const input = [...p.el().querySelectorAll('td-text-input')].find((t) => t.textContent?.includes(label))!.querySelector('input')!;
      await p.type(input, value);
    }
    p.el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await p.settle();
    p.http.expectOne('/api/admin/login').flush({ token: 'new', expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    await p.settle();
    expect(p.router().url).toBe('/users');
    answerLists(p.http);
    await p.settle();
    expect(p.el().querySelectorAll('[data-page="users"] tbody tr').length).toBe(2);
  });
});
