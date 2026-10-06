import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { DeviceRecord } from '@token-derby/shared';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { MemoryStorage } from '../session/memory-storage';
import { REDIRECT } from '../session/redirect';
import { provideSession } from '../session/session';
import { SESSION_KEYS, SESSION_STORAGE } from '../session/session-storage';
import { sessionAuth } from '../session/session.interceptor';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const SIGNED_IN: Record<string, string> = {
  [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar', [SESSION_KEYS.email]: 'omar@stackone.com',
};
const DEVICES: DeviceRecord[] = [
  { device_id: 'd1', label: 'omar-mbp', created_at: '2026-09-12T10:00:00Z', last_seen_at: '2026-10-06T11:58:00Z' },
  { device_id: 'd2', label: 'old-laptop', created_at: '2026-08-01T10:00:00Z', last_seen_at: '2026-09-01T10:00:00Z' },
];

async function open(url: string, seed: Record<string, string> = SIGNED_IN) {
  const storage = new MemoryStorage(seed);
  const redirects: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideSession(),
      { provide: SESSION_STORAGE, useValue: storage },
      { provide: RESIZE_OBSERVER, useValue: null },
      { provide: REDIRECT, useValue: (u: string) => redirects.push(u) },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const http = TestBed.inject(HttpTestingController);
  const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  const el = () => harness.routeNativeElement as HTMLElement;
  const type = async (sel: string, value: string) => {
    const input = el().querySelector<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const click = async (sel: string) => { el().querySelector<HTMLElement>(sel)!.click(); await settle(); };
  return { el, http, settle, type, click, storage, redirects };
}

describe('Account page', () => {
  it('asks you to sign in, coming back here afterwards', async () => {
    const { el } = await open('/account', {});
    expect(el().querySelector('td-google-button a')?.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2Faccount');
    expect(el().querySelector('td-tabs')).toBeNull();
  });

  it('opens on Profile with your name and Save greyed', async () => {
    const { el } = await open('/account');
    expect(el().querySelector('td-tabs a.on')?.textContent?.trim()).toBe('Profile');
    expect([...el().querySelectorAll('td-crumbs .part')].map((p) => p.textContent?.trim())).toEqual(['Omar', 'Account']);
    expect(el().querySelector<HTMLInputElement>('input.name')?.value).toBe('Omar');
    expect(el().querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);
  });

  it('keeps Save greyed for the same name with spaces around it', async () => {
    const { el, type } = await open('/account');
    await type('input.name', ' Omar ');
    expect(el().querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(true);
  });

  it('renames you, everywhere at once', async () => {
    const { el, type, click, http, settle, storage } = await open('/account');
    await type('input.name', 'Omar Mauri');
    expect(el().querySelector<HTMLButtonElement>('button.save')?.disabled).toBe(false);
    await click('button.save');
    const req = http.expectOne('/api/jockey/me');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ display_name: 'Omar Mauri' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush({ user_id: 'u1', display_name: 'Omar Mauri' });
    await settle();
    expect(el().querySelector('.saved')?.textContent?.trim()).toBe('Saved.');
    expect(el().querySelector('td-account-menu .trigger .name')?.textContent?.trim()).toBe('Omar Mauri');
    expect(storage.getItem(SESSION_KEYS.name)).toBe('Omar Mauri');
  });

  it('shows the reason a name was refused', async () => {
    const { el, type, click, http, settle } = await open('/account');
    await type('input.name', 'x');
    await click('button.save');
    http.expectOne('/api/jockey/me').flush({ code: 'BAD_REQUEST', message: 'display_name must be 1–40 characters' }, { status: 400, statusText: 'Bad' });
    await settle();
    expect(el().querySelector('.error')?.textContent).toContain('display_name must be 1–40 characters');
    expect(el().querySelector('.saved')).toBeNull();
  });

  it('signs you out when the session has expired during a rename', async () => {
    const { el, type, click, http, settle } = await open('/account');
    await type('input.name', 'New');
    await click('button.save');
    http.expectOne('/api/jockey/me').flush({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401, statusText: 'No' });
    await settle();
    expect(el().querySelector('td-google-button')).not.toBeNull();
    expect(el().querySelector('.saved')).toBeNull();
  });

  it('shows your Google email', async () => {
    const { el } = await open('/account');
    expect(el().querySelector('.google')?.textContent).toContain('omar@stackone.com');
    expect(el().querySelector('button.link')).toBeNull();
  });

  it('offers to link Google when there is no email', async () => {
    const { [SESSION_KEYS.email]: _, ...noEmail } = SIGNED_IN;
    const { click, http, settle, redirects } = await open('/account', noEmail);
    await click('button.link');
    http.expectOne('/api/auth/link/start').flush({ authorize_url: 'https://accounts.google.com/x' });
    await settle();
    expect(redirects).toEqual(['https://accounts.google.com/x']);
  });

  it('signs out from the Profile tab and goes home', async () => {
    const { click, http, settle, el } = await open('/account');
    await click('button.signout');
    http.expectOne('/api/web-sessions').flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(el().getAttribute('data-page') ?? el().querySelector('[data-page]')?.getAttribute('data-page')).toBe('home');
  });

  it('signs out of all browsers after confirming, then goes home', async () => {
    const { click, http, settle, el } = await open('/account');
    await click('button.signout-all');
    expect(el().querySelector('td-confirm .box')?.textContent).toContain('every other browser');
    http.expectNone('/api/web-sessions/all');
    await click('td-confirm button.confirm');
    http.expectOne('/api/web-sessions/all').flush({ signed_out: 2 });
    await settle();
    expect(el().getAttribute('data-page') ?? el().querySelector('[data-page]')?.getAttribute('data-page')).toBe('home');
  });

  it('keeps you signed in and says so when signing out everywhere fails', async () => {
    const { click, http, settle, el } = await open('/account');
    await click('button.signout-all');
    await click('td-confirm button.confirm');
    http.expectOne('/api/web-sessions/all').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('[data-tab="profile"] .signout-error')?.textContent).toContain("Couldn't sign out everywhere");
    expect(el().querySelector('td-confirm .box')).toBeNull();
  });

  it('cancelling the sign out of all browsers sends nothing', async () => {
    const { click, http, el } = await open('/account');
    await click('button.signout-all');
    await click('td-confirm button.cancel');
    http.expectNone('/api/web-sessions/all');
    expect(el().querySelector('td-confirm .box')).toBeNull();
  });
});

describe('Account devices', () => {
  it('loads your devices and revokes one after confirming', async () => {
    const { el, http, settle, click } = await open('/account/devices');
    expect(el().querySelector('td-tabs a.on')?.textContent?.trim()).toBe('Devices');
    expect(el().querySelector('td-loader')).not.toBeNull();
    http.expectOne('/api/devices').flush({ devices: DEVICES, has_legacy_credential: false });
    await settle();
    expect(el().querySelectorAll('td-device-list tbody tr')).toHaveLength(2);
    el().querySelectorAll<HTMLButtonElement>('button.revoke')[1]!.click();
    await settle();
    expect(el().querySelector('td-confirm .box')?.textContent).toContain('old-laptop');
    await click('td-confirm button.confirm');
    const req = http.expectOne('/api/devices/d2');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });
    await settle();
    expect(el().querySelectorAll('td-device-list tbody tr')).toHaveLength(1);
    expect(el().querySelector('td-confirm .box')).toBeNull();
  });

  it('shows the empty message once the last device is revoked', async () => {
    const { el, http, settle, click } = await open('/account/devices');
    http.expectOne('/api/devices').flush({ devices: [DEVICES[0]], has_legacy_credential: false });
    await settle();
    await click('button.revoke');
    await click('td-confirm button.confirm');
    http.expectOne('/api/devices/d1').flush({ ok: true });
    await settle();
    expect(el().querySelector('td-device-list table')).toBeNull();
    expect(el().querySelector('.empty')?.textContent).toContain('token-derby login');
  });

  it('keeps the row and says so when a revoke fails', async () => {
    const { el, http, settle, click } = await open('/account/devices');
    http.expectOne('/api/devices').flush({ devices: DEVICES, has_legacy_credential: false });
    await settle();
    el().querySelectorAll<HTMLButtonElement>('button.revoke')[1]!.click();
    await settle();
    await click('td-confirm button.confirm');
    http.expectOne('/api/devices/d2').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('.revoke-error')?.textContent?.trim()).toBe("Couldn't revoke old-laptop. Try again.");
    expect(el().querySelectorAll('td-device-list tbody tr')).toHaveLength(2);
  });

  it('cancels a revoke', async () => {
    const { el, http, settle, click } = await open('/account/devices');
    http.expectOne('/api/devices').flush({ devices: DEVICES, has_legacy_credential: false });
    await settle();
    await click('button.revoke');
    await click('td-confirm button.cancel');
    expect(el().querySelector('td-confirm .box')).toBeNull();
    http.expectNone((r) => r.method === 'DELETE');
  });

  it('says so when devices fail to load', async () => {
    const { el, http, settle } = await open('/account/devices');
    http.expectOne('/api/devices').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('.failed')?.textContent).toContain("Couldn't load your devices.");
  });

  it('notes an older CLI credential', async () => {
    const { el, http, settle } = await open('/account/devices');
    http.expectOne('/api/devices').flush({ devices: [], has_legacy_credential: true });
    await settle();
    expect(el().querySelector('.legacy')?.textContent).toContain('token-derby init');
  });
});

describe('Account link in the name menu', () => {
  it('leads to the account page', async () => {
    const { el, http, settle } = await open('/');
    http.match('/api/organisations').forEach((r) => r.flush({ organisations: [] }));
    await settle();
    el().querySelector<HTMLButtonElement>('td-account-menu button.trigger')!.click();
    await settle();
    const item = [...document.body.querySelectorAll<HTMLElement>('.item')].find((i) => i.textContent?.includes('Account'));
    expect(item?.getAttribute('href')).toBe('/account');
  });
});
