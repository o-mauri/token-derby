import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrors } from '@token-derby/ui';
import { MemoryStorage } from './memory-storage';
import { Session } from './session';
import { SESSION_KEYS, SESSION_STORAGE } from './session-storage';
import { sessionAuth } from './session.interceptor';

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const past = () => new Date(Date.now() - 1000).toISOString();
const SIGNED_IN = () => ({ [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar', [SESSION_KEYS.expires]: future() });

function setup(seed: Record<string, string> = {}, path = '/') {
  const storage = new MemoryStorage(seed);
  TestBed.configureTestingModule({
    providers: [
      Session,
      { provide: SESSION_STORAGE, useValue: storage },
      provideHttpClient(withInterceptors([sessionAuth, apiErrors])),
      provideHttpClientTesting(),
      provideLocationMocks(),
    ],
  });
  const location = TestBed.inject(Location);
  location.replaceState(path);
  return { storage, location, http: TestBed.inject(HttpTestingController), session: () => TestBed.inject(Session) };
}

describe('Session', () => {
  it('picks up a saved session', () => {
    const { session } = setup(SIGNED_IN());
    expect(session().signedIn()).toBe(true);
    expect(session().user()?.display_name).toBe('Omar');
  });

  it('drops a session past its expiry', () => {
    const { session, storage } = setup({ ...SIGNED_IN(), [SESSION_KEYS.expires]: past() });
    expect(session().signedIn()).toBe(false);
    expect(storage.length).toBe(0);
  });

  it('keeps an old-site session that has no name or expiry', () => {
    const { session } = setup({ [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1' });
    expect(session().signedIn()).toBe(true);
    expect(session().user()?.display_name).toBeNull();
  });

  it('exchanges the code from the URL, clearing it first', async () => {
    const { session, http, location, storage } = setup({}, '/#code=AB12');
    const done = session().exchangeFromUrl();
    expect(location.path(true)).not.toContain('#');
    const req = http.expectOne('/api/web-sessions/exchange');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'AB12' });
    req.flush({ token: 'new', expires_at: future(), user: { user_id: 'u9', display_name: 'Ada', email: 'a@b.c' } });
    expect(await done).toBe('ok');
    expect(session().user()).toEqual({ user_id: 'u9', display_name: 'Ada', email: 'a@b.c' });
    expect(storage.getItem(SESSION_KEYS.token)).toBe('new');
  });

  it('does nothing when the URL has no code', async () => {
    const { session, http } = setup({}, '/org/acme');
    expect(await session().exchangeFromUrl()).toBe('none');
    http.expectNone('/api/web-sessions/exchange');
  });

  it('reports a failed exchange and stays signed out', async () => {
    const { session, http, location } = setup({}, '/#code=BAD');
    const done = session().exchangeFromUrl();
    http.expectOne('/api/web-sessions/exchange').flush({ code: 'INVALID_CODE', message: 'x' }, { status: 400, statusText: 'Bad' });
    expect(await done).toBe('failed');
    expect(session().signedIn()).toBe(false);
    expect(session().exchangeFailed()).toBe(true);
    expect(location.path(true)).not.toContain('#');
  });

  it('signs out on the server and locally', async () => {
    const { session, http, storage } = setup(SIGNED_IN());
    const done = session().signOut();
    const req = http.expectOne('/api/web-sessions');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(session().signedIn()).toBe(false);
    expect(storage.length).toBe(0);
  });

  it('still signs out locally when the server call fails', async () => {
    const { session, http } = setup(SIGNED_IN());
    const done = session().signOut();
    http.expectOne('/api/web-sessions').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await expect(done).resolves.toBeUndefined();
    expect(session().signedIn()).toBe(false);
  });

  it('renames you, updating the stored name', async () => {
    const { session, http, storage } = setup(SIGNED_IN());
    const done = session().rename('Ada');
    const req = http.expectOne('/api/jockey/me');
    expect(req.request.method).toBe('PUT');
    req.flush({ user_id: 'u1', display_name: 'Ada' });
    await done;
    expect(session().user()?.display_name).toBe('Ada');
    expect(storage.getItem(SESSION_KEYS.name)).toBe('Ada');
  });

  it('changes nothing when a rename fails', async () => {
    const { session, http, storage } = setup(SIGNED_IN());
    const done = session().rename('Ada');
    http.expectOne('/api/jockey/me').flush({ code: 'BAD_REQUEST', message: 'x' }, { status: 400, statusText: 'Bad' });
    await expect(done).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(session().user()?.display_name).toBe('Omar');
    expect(storage.getItem(SESSION_KEYS.name)).toBe('Omar');
  });
});
