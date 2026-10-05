import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { Route, Routes } from '@angular/router';
import { apiErrors } from '@token-derby/ui';
import { RaceApi } from '../race/race-api';
import { fixtureInterceptor } from './fixture.interceptor';
import { OrgApi } from '../org/org-api';
import { OrgData } from '../org/org-data';
import { orgFixtureInterceptor } from './org-fixture.interceptor';
import { PREVIEW_ORG } from './org-fixture';
import { PREVIEW_JOIN_CODE } from './race-fixture';

// Each preview gets its own HttpClient and RaceApi, so the fixtures never reach the real app's requests.
const race = (path: string): Route => ({
  path,
  providers: [provideHttpClient(withInterceptors([apiErrors, fixtureInterceptor])), RaceApi],
  data: { code: PREVIEW_JOIN_CODE },
  loadComponent: () => import('../race/race.page').then((m) => m.RacePage),
});

/** Fixture-backed previews of real pages. Production builds swap this file for preview.routes.prod.ts. */
// The org dashboard and races page over a fixture org, with their own HttpClient like the race previews.
const org: Route = {
  path: 'preview-org',
  providers: [provideHttpClient(withInterceptors([apiErrors, orgFixtureInterceptor])), RaceApi, OrgApi, OrgData],
  data: { name: PREVIEW_ORG },
  loadComponent: () => import('../org/org-shell').then((m) => m.OrgShell),
  children: [
    { path: '', loadComponent: () => import('../org/org.page').then((m) => m.OrgPage) },
    { path: 'races', loadComponent: () => import('../org/races.page').then((m) => m.RacesPage) },
  ],
};

export const previewRoutes: Routes = [race('preview-race'), race('preview-loader'), race('preview-not-found'), org];
