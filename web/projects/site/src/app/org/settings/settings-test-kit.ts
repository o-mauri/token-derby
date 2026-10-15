import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { GetOrganisationResponse } from '@token-derby/shared';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { routes } from '../../app.routes';
import { MemoryStorage } from '../../session/memory-storage';
import { provideSession } from '../../session/session';
import { SESSION_KEYS, SESSION_STORAGE } from '../../session/session-storage';
import { sessionAuth } from '../../session/session.interceptor';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export const SIGNED_IN: Record<string, string> = { [SESSION_KEYS.token]: 'tok', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar' };

export const orgRecord = (over: Partial<GetOrganisationResponse> = {}): GetOrganisationResponse => ({
  org_id: 'o1', org_name: 'Acme', org_join_token: 'td_join_abc', created_at: '2026-05-14T10:00:00Z',
  creator_user_id: 'u1', creator_user_name: 'Omar',
  access: { allowed_domains: ['acme.com'], join_token_enabled: true, domain_join_enabled: true, restrict_to_allowed_domains: false },
  ...over,
});

/** Opens a settings or org URL with the real routes, a session, and an HTTP mock; answers the shell's own org requests. */
export async function openSettings(url: string, seed: Record<string, string> = SIGNED_IN) {
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
  const settle = async () => { for (let i = 0; i < 4; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  // The dashboard's own polls (races, standings) aren't under test here.
  const quiet = () => {
    http.match('/api/organisations/Acme/races').forEach((r) => r.flush({ org_name: 'Acme', races: [] }));
    http.match('/api/organisations/Acme/league/standings').forEach((r) => r.flush({ standings: null }));
  };
  const el = () => harness.routeNativeElement as HTMLElement;
  const answerOrg = async (body: GetOrganisationResponse | { status: number; code: string } = orgRecord()) => {
    const req = http.expectOne('/api/organisations/Acme');
    if ('status' in body) req.flush({ code: body.code, message: 'x' }, { status: body.status, statusText: 'x' });
    else req.flush(body);
    quiet();
    await settle();
  };
  const click = async (sel: string, i = 0) => { el().querySelectorAll<HTMLElement>(sel)[i]!.click(); await settle(); };
  // While a navigation waits on a question, whenStable would wait too, so just render.
  const render = async () => { for (let i = 0; i < 4; i++) { await tick(); harness.fixture.detectChanges(); } };
  return { harness, http, settle, render, quiet, el, answerOrg, click, router: () => TestBed.inject(Router) };
}
