import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../app.routes';
import { MemoryStorage } from '../session/memory-storage';
import { REDIRECT } from '../session/redirect';
import { provideSession } from '../session/session';
import { SESSION_KEYS, SESSION_STORAGE } from '../session/session-storage';
import { sessionAuth } from '../session/session.interceptor';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const SIGNED_IN = { [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar' };

async function open(url: string, seed: Record<string, string> = SIGNED_IN) {
  const redirects: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideSession(),
      { provide: SESSION_STORAGE, useValue: new MemoryStorage(seed) },
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
  const enter = async (code: string) => {
    const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(e, 'clipboardData', { value: { getData: () => code } });
    el().querySelector('td-code-input input.cell')!.dispatchEvent(e);
    await settle();
  };
  const click = async (sel: string) => { el().querySelector<HTMLElement>(sel)!.click(); await settle(); };
  return { el, http, settle, enter, click, redirects };
}

const fail = (code: string, status: number) => [{ code, message: 'x' }, { status, statusText: 'x' }] as const;

describe('/cli', () => {
  it('asks you to sign in, coming back to /cli', async () => {
    const { el } = await open('/cli', {});
    expect(el().querySelector('td-google-button a')?.getAttribute('href')).toBe('/api/auth/google/start?return_to=%2Fcli');
    expect(el().querySelector('td-code-input')).toBeNull();
  });

  it('warns about phishing while you enter a code', async () => {
    const { el } = await open('/cli');
    expect(el().querySelector('.warning')?.textContent).toContain('Only enter a code from a terminal you started yourself.');
  });

  it('refuses a short code without asking the server', async () => {
    const { el, enter, click, http } = await open('/cli');
    await enter('k7qx2');
    await click('button.lookup');
    expect(el().querySelector('.error')?.textContent?.trim()).toBe('Enter the 6-character code from your terminal.');
    http.expectNone('/api/auth/cli/approve');
  });

  it('looks the code up, then approves it', async () => {
    const { el, enter, click, http, settle } = await open('/cli');
    await enter('k7qx2m');
    await click('button.lookup');
    const preview = http.expectOne('/api/auth/cli/approve');
    expect(preview.request.body).toEqual({ user_code: 'K7QX2M', preview: true });
    expect(preview.request.headers.get('Authorization')).toBe('Bearer tok');
    preview.flush({ label: 'omar-mbp' });
    await settle();
    expect(el().querySelector('.confirm-label')?.textContent).toContain('"omar-mbp"');
    await click('button.approve');
    const approve = http.expectOne('/api/auth/cli/approve');
    expect(approve.request.body).toEqual({ user_code: 'K7QX2M' });
    approve.flush({ label: 'omar-mbp' });
    await settle();
    expect(el().querySelector('.done')?.textContent).toContain('Approved. You can go back to your terminal.');
  });

  it.each([
    ['CLI_AUTH_NOT_FOUND', 404, "That code didn't match. Check your terminal and try again."],
    ['CLI_AUTH_WRONG_ACCOUNT', 403, 'That code belongs to another account.'],
    ['RATE_LIMITED', 429, 'Too many attempts. Wait a minute and try again.'],
    ['INTERNAL', 500, "Couldn't approve that code. Try again."],
  ])('explains %s', async (code, status, text) => {
    const { el, enter, click, http, settle } = await open('/cli');
    await enter('K7QX2M');
    await click('button.lookup');
    http.expectOne('/api/auth/cli/approve').flush(...fail(code, status));
    await settle();
    expect(el().querySelector('.error')?.textContent?.trim()).toBe(text);
  });

  it('goes back to entering the code when approval fails after a good look-up', async () => {
    const { el, enter, click, http, settle } = await open('/cli');
    await enter('K7QX2M');
    await click('button.lookup');
    http.expectOne('/api/auth/cli/approve').flush({ label: 'omar-mbp' });
    await settle();
    await click('button.approve');
    http.expectOne('/api/auth/cli/approve').flush(...fail('CLI_AUTH_NOT_FOUND', 404));
    await settle();
    expect(el().querySelector('td-code-input')).not.toBeNull();
    expect(el().querySelector('.error')?.textContent?.trim()).toBe("That code didn't match. Check your terminal and try again.");
  });

  it('cancels back to entering the code', async () => {
    const { el, enter, click, http, settle } = await open('/cli');
    await enter('K7QX2M');
    await click('button.lookup');
    http.expectOne('/api/auth/cli/approve').flush({ label: 'omar-mbp' });
    await settle();
    await click('button.cancel');
    expect(el().querySelector('td-code-input')).not.toBeNull();
  });
});

describe('/link-google', () => {
  it('goes straight on to Google when signed in', async () => {
    const { http, settle, redirects } = await open('/link-google');
    http.expectOne('/api/auth/link/start').flush({ authorize_url: 'https://accounts.google.com/x' });
    await settle();
    expect(redirects).toEqual(['https://accounts.google.com/x']);
  });

  it('points you at the terminal when there is no session', async () => {
    const { el, http } = await open('/link-google', {});
    expect(el().textContent).toContain('token-derby link');
    http.expectNone('/api/auth/link/start');
  });

  it('shows why linking could not start', async () => {
    const { el, http, settle } = await open('/link-google');
    http.expectOne('/api/auth/link/start').flush({ code: 'EMAIL_ALREADY_LINKED', message: 'This account already has a Google login.' }, { status: 409, statusText: 'x' });
    await settle();
    expect(el().querySelector('.error')?.textContent).toContain('This account already has a Google login.');
  });
});
