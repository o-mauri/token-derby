import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { Route, Routes } from '@angular/router';
import { apiErrors } from '@token-derby/ui';
import { RaceApi } from '../race/race-api';
import { fixtureInterceptor } from './fixture.interceptor';
import { orgFixtureInterceptor } from './org-fixture.interceptor';
import { PREVIEW_ORG } from './org-fixture';
import { PREVIEW_JOIN_CODE } from './race-fixture';
import { Session } from '../session/session';
import { SESSION_STORAGE } from '../session/session-storage';
import { sessionAuth } from '../session/session.interceptor';
import { homeFixtureInterceptor } from './home-fixture.interceptor';
import { previewSessionStorage } from './home-fixture';
import { previewAccountStorage } from './account-fixture';
import { accountFixtureInterceptor } from './account-fixture.interceptor';
import { cliFixtureInterceptor, previewCliLabel, previewCliStep } from './cli-fixture.interceptor';

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
  providers: [provideHttpClient(withInterceptors([apiErrors, orgFixtureInterceptor])), RaceApi],
  data: { name: PREVIEW_ORG },
  loadComponent: () => import('../org/org-shell').then((m) => m.OrgShell),
  children: [
    { path: '', loadComponent: () => import('../org/org.page').then((m) => m.OrgPage) },
    { path: 'races', loadComponent: () => import('../org/races.page').then((m) => m.RacesPage) },
    { path: 'league', loadComponent: () => import('../org/league.page').then((m) => m.LeaguePage) },
  ],
};

// The home page with a fake session and org list; its own Session so the real one is untouched.
const home: Route = {
  path: 'preview-home',
  providers: [
    { provide: SESSION_STORAGE, useFactory: previewSessionStorage },
    Session,
    provideHttpClient(withInterceptors([sessionAuth, apiErrors, homeFixtureInterceptor])),
  ],
  loadComponent: () => import('../home/home.page').then((m) => m.HomePage),
};

// The account page over a fake session and device list.
const account: Route = {
  path: 'preview-account',
  providers: [
    { provide: SESSION_STORAGE, useFactory: previewAccountStorage },
    Session,
    provideHttpClient(withInterceptors([sessionAuth, apiErrors, accountFixtureInterceptor])),
  ],
  loadComponent: () => import('../account/account.shell').then((m) => m.AccountShell),
  children: [
    { path: '', loadComponent: () => import('../account/profile.tab').then((m) => m.ProfileTab) },
    { path: 'devices', loadComponent: () => import('../account/devices.tab').then((m) => m.DevicesTab) },
  ],
};

// The CLI approve page, signed in (unless ?signed=out), answering from a fixture.
const cli: Route = {
  path: 'preview-cli',
  providers: [
    { provide: SESSION_STORAGE, useFactory: previewAccountStorage },
    Session,
    provideHttpClient(withInterceptors([sessionAuth, apiErrors, cliFixtureInterceptor])),
  ],
  resolve: { initialStep: previewCliStep, initialLabel: previewCliLabel },
  runGuardsAndResolvers: 'always',
  loadComponent: () => import('../cli/cli-approve.page').then((m) => m.CliApprovePage),
};

export const previewRoutes: Routes = [race('preview-race'), race('preview-loader'), race('preview-not-found'), org, home, account, cli];
