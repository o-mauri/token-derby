import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { firstValueFrom } from 'rxjs';
import { ApiError, apiErrors } from '@token-derby/ui';
import { MemoryStorage } from './memory-storage';
import { Session } from './session';
import { SESSION_KEYS, SESSION_STORAGE } from './session-storage';
import { WITH_SESSION, sessionAuth } from './session.interceptor';

function setup(signedIn: boolean) {
  TestBed.configureTestingModule({
    providers: [
      Session,
      { provide: SESSION_STORAGE, useValue: new MemoryStorage(signedIn ? { [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1' } : {}) },
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideLocationMocks(),
    ],
  });
  const client = TestBed.inject(HttpClient);
  const get = (withSession: boolean) =>
    firstValueFrom(client.get('/api/x', { context: new HttpContext().set(WITH_SESSION, withSession) }));
  return { get, http: TestBed.inject(HttpTestingController), session: TestBed.inject(Session) };
}

describe('sessionAuth', () => {
  it('leaves requests that did not ask for the session alone, even when signed in', () => {
    const { get, http } = setup(true);
    void get(false);
    expect(http.expectOne('/api/x').request.headers.has('Authorization')).toBe(false);
  });

  it('adds the bearer token to requests that ask for it', () => {
    const { get, http } = setup(true);
    void get(true);
    expect(http.expectOne('/api/x').request.headers.get('Authorization')).toBe('Bearer tok');
  });

  it('adds nothing when signed out', () => {
    const { get, http } = setup(false);
    void get(true);
    expect(http.expectOne('/api/x').request.headers.has('Authorization')).toBe(false);
  });

  it('signs you out when a session request comes back 401, and still fails the request', async () => {
    const { get, http, session } = setup(true);
    const res = get(true);
    http.expectOne('/api/x').flush({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    await expect(res).rejects.toMatchObject({ status: 401 });
    await res.catch((e) => expect(e).toBeInstanceOf(ApiError));
    expect(session.signedIn()).toBe(false);
  });

  it('keeps the session when a public request comes back 401', async () => {
    const { get, http, session } = setup(true);
    const res = get(false);
    http.expectOne('/api/x').flush({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    await res.catch(() => undefined);
    expect(session.signedIn()).toBe(true);
  });
});
