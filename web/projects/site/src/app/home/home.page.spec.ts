import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { MemoryStorage } from '../session/memory-storage';
import { provideSession } from '../session/session';
import { SESSION_KEYS, SESSION_STORAGE } from '../session/session-storage';
import { sessionAuth } from '../session/session.interceptor';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const SIGNED_IN = { [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar' };

async function open(url = '/', seed: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideSession(),
      { provide: SESSION_STORAGE, useValue: new MemoryStorage(seed) },
      { provide: RESIZE_OBSERVER, useValue: null },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const http = TestBed.inject(HttpTestingController);
  const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  const el = () => harness.routeNativeElement as HTMLElement;
  const submit = async (box: string, value: string) => {
    const host = el().querySelector<HTMLElement>(`td-go-box.${box}`)!;
    const input = host.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  };
  return { harness, http, settle, el, submit, router: () => TestBed.inject(Router) };
}

const orgs = (...names: string[]) => ({ organisations: names.map((n, i) => ({ org_id: String(i), org_name: n })) });

describe('HomePage signed out', () => {
  it('offers Google sign-in back to home, and Find an org, without asking for orgs', async () => {
    const { el, http } = await open();
    expect(el().querySelector('td-google-button a')?.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2F');
    expect(el().querySelector('td-account-menu')).toBeNull();
    expect(el().querySelector('td-you-card')).toBeNull();
    expect(el().querySelector('td-go-box.org')).not.toBeNull();
    http.expectNone('/api/organisations');
  });

  it('goes to the org you type', async () => {
    const { submit, router } = await open();
    await submit('org', 'acme');
    expect(router().url).toBe('/org/acme');
  });

  it('goes to the race code you type, upper-cased', async () => {
    const { submit, router } = await open();
    await submit('race', 'abc123');
    expect(router().url).toBe('/race/ABC123');
  });

  it('says why sign-in failed, and keeps saying it after the URL is tidied', async () => {
    const { el, router } = await open('/?auth_error=expired');
    expect(router().url).toBe('/');
    expect(el().querySelector('.auth-error')?.textContent?.trim()).toBe('That sign-in took too long. Try again.');
  });

  it('falls back to the general message for an unknown error', async () => {
    const { el } = await open('/?auth_error=weird');
    expect(el().querySelector('.auth-error')?.textContent?.trim()).toBe("Couldn't sign you in with Google. Try again.");
  });
});

describe('HomePage signed in', () => {
  it('shows the loader, then your orgs sorted and linked, with your card', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    expect(el().querySelector('td-loader')).not.toBeNull();
    const req = http.expectOne('/api/organisations');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush(orgs('Stackone', 'acme'));
    await settle();
    expect([...el().querySelectorAll('td-org-list a.row')].map((a) => a.getAttribute('href'))).toEqual(['/org/acme', '/org/Stackone']);
    expect(el().querySelector('td-loader')).toBeNull();
    expect(el().querySelector('td-you-card .card.disabled')?.textContent).toContain('Omar');
    expect(el().querySelector('td-account-menu')).not.toBeNull();
    expect(el().querySelector('td-google-button')).toBeNull();
  });

  it('says you have no orgs and opens Find an org', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    http.expectOne('/api/organisations').flush(orgs());
    await settle();
    expect(el().querySelector('.empty')?.textContent).toContain("You're not in any orgs yet.");
    expect(el().querySelector('td-go-box.org')).not.toBeNull();
  });

  it('keeps the race box when your orgs fail to load', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    http.expectOne('/api/organisations').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('.failed')?.textContent).toContain("Couldn't load your orgs.");
    expect(el().querySelector('td-go-box.race')).not.toBeNull();
  });

  it('signs you out when the session has expired on the server', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    http.expectOne('/api/organisations').flush({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(el().querySelector('td-google-button')).not.toBeNull();
  });

  it('opens Find another org on request', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    http.expectOne('/api/organisations').flush(orgs('acme'));
    await settle();
    expect(el().querySelector('td-go-box.org')).toBeNull();
    el().querySelector<HTMLButtonElement>('button.find')!.click();
    await settle();
    expect(el().querySelector('td-go-box.org')).not.toBeNull();
  });

  it('signs out from the menu', async () => {
    const { el, http, settle } = await open('/', SIGNED_IN);
    http.expectOne('/api/organisations').flush(orgs('acme'));
    await settle();
    el().querySelector<HTMLButtonElement>('td-account-menu button.trigger')!.click();
    await settle();
    [...document.body.querySelectorAll<HTMLElement>('.item')].find((i) => i.textContent?.includes('Sign out'))!.click();
    await settle();
    const req = http.expectOne('/api/web-sessions');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(el().querySelector('td-google-button')).not.toBeNull();
  });

  it('links the secondary pages', async () => {
    const { el } = await open();
    expect([...el().querySelectorAll('nav.links a')].map((a) => a.getAttribute('href'))).toEqual(['/catalog', '/about', '/privacy']);
  });
});
