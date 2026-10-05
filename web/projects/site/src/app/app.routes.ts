import type { CanMatchFn, Routes } from '@angular/router';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { OrgApi } from './org/org-api';
import { OrgData } from './org/org-data';
import { previewRoutes } from './preview/preview.routes';

const RACE_CODE = /^[A-Za-z0-9]+$/;

/** Only well-formed join codes reach the race page; anything else falls through to not-found. */
export const raceCodeGuard: CanMatchFn = (_route, segments) => RACE_CODE.test(segments[1]?.path ?? '');

/** Only valid org names (1–12 letters and digits) reach the org pages; anything else falls through to not-found. */
export const orgNameGuard: CanMatchFn = (_route, segments) => ORG_NAME_PATTERN.test(segments[1]?.path ?? '');

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./home/home.page').then((m) => m.HomePage) },
  { path: 'race/:code', canMatch: [raceCodeGuard], loadComponent: () => import('./race/race.page').then((m) => m.RacePage) },
  {
    path: 'org/:name',
    canMatch: [orgNameGuard],
    providers: [OrgApi, OrgData],
    loadComponent: () => import('./org/org-shell').then((m) => m.OrgShell),
    children: [
      { path: '', loadComponent: () => import('./org/org.page').then((m) => m.OrgPage) },
      { path: 'races', loadComponent: () => import('./org/races.page').then((m) => m.RacesPage) },
    ],
  },
  ...previewRoutes,
  { path: '**', loadComponent: () => import('./not-found/not-found.page').then((m) => m.NotFoundPage) },
];
