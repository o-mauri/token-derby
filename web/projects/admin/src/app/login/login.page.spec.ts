import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { MemoryStorage } from '../testing/memory-storage';
import { ADMIN_KEYS, ADMIN_STORAGE } from '../session/admin-session';
import { adminAuth } from '../session/admin-auth';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const future = () => new Date(Date.now() + 3_600_000).toISOString();

async function open(url: string, seed: Record<string, string> = {}) {
  const storage = new MemoryStorage(seed);
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([adminAuth, apiErrors])),
      provideHttpClientTesting(),
      { provide: ADMIN_STORAGE, useValue: storage },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  const el = () => harness.routeNativeElement as HTMLElement;
  const fill = async (label: string, value: string) => {
    const input = [...el().querySelectorAll('td-text-input')].find((t) => t.textContent?.includes(label))!.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const submit = async () => { el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  return { el, settle, fill, submit, storage, http: TestBed.inject(HttpTestingController), router: () => TestBed.inject(Router) };
}

describe('Login page', () => {
  it('signs in, stores the token and goes where you were headed', async () => {
    const p = await open('/login?return_to=%2Fusers%2Fu2');
    await p.fill('Username', 'admin');
    await p.fill('Password', 'pw');
    await p.submit();
    expect(p.el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    const req = p.http.expectOne('/api/admin/login');
    expect(req.request.body).toEqual({ username: 'admin', password: 'pw' });
    req.flush({ token: 'tok', expires_at: future() });
    await p.settle();
    expect(p.storage.getItem(ADMIN_KEYS.token)).toBe('tok');
    expect(p.router().url).toBe('/users/u2');
  });

  it('goes to Users when there is nowhere safe to return to', async () => {
    const p = await open('/login?return_to=%2F%2Fevil.com');
    await p.fill('Username', 'admin');
    await p.fill('Password', 'pw');
    await p.submit();
    p.http.expectOne('/api/admin/login').flush({ token: 'tok', expires_at: future() });
    await p.settle();
    expect(p.router().url).toBe('/users');
  });

  it('says so when the credentials are wrong', async () => {
    const p = await open('/login');
    await p.fill('Username', 'admin');
    await p.fill('Password', 'nope');
    await p.submit();
    p.http.expectOne('/api/admin/login').flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' });
    await p.settle();
    expect(p.el().querySelector('[role="alert"]')?.textContent).toContain('Invalid username or password');
    expect(p.el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('says so when the server cannot be reached', async () => {
    const p = await open('/login');
    await p.fill('Username', 'admin');
    await p.fill('Password', 'pw');
    await p.submit();
    p.http.expectOne('/api/admin/login').error(new ProgressEvent('error'));
    await p.settle();
    expect(p.el().querySelector('[role="alert"]')?.textContent).toContain("Couldn't reach the server. Try again.");
  });

  it('gives the inputs autofill hints', async () => {
    const p = await open('/login');
    const inputs = [...p.el().querySelectorAll('input')];
    expect(inputs.map((i) => i.getAttribute('autocomplete'))).toEqual(['username', 'current-password']);
    expect(inputs[1]!.type).toBe('password');
  });

  it('sends a signed-in admin straight to Users', async () => {
    const p = await open('/login', { [ADMIN_KEYS.token]: 'tok' });
    expect(p.router().url).toBe('/users');
  });
});
