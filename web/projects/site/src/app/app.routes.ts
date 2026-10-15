import type { CanMatchFn, Routes } from '@angular/router';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { previewRoutes } from './preview/preview.routes';

const RACE_CODE = /^[A-Za-z0-9]+$/;

/** Only well-formed join codes reach the race page; anything else falls through to not-found. */
export const raceCodeGuard: CanMatchFn = (_route, segments) => RACE_CODE.test(segments[1]?.path ?? '');

/** Only valid org names (1–12 letters and digits) reach the org pages; anything else falls through to not-found. */
export const orgNameGuard: CanMatchFn = (_route, segments) => ORG_NAME_PATTERN.test(segments[1]?.path ?? '');

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./home/home.page').then((m) => m.HomePage) },
  // Sign-in failures the API can't trace back to a page still land here; the query (auth_error) carries over.
  { path: 'org-manager', redirectTo: '' },
  { path: 'race/:code', canMatch: [raceCodeGuard], loadComponent: () => import('./race/race.page').then((m) => m.RacePage) },
  {
    path: 'org/:name',
    canMatch: [orgNameGuard],
    loadComponent: () => import('./org/org-shell').then((m) => m.OrgShell),
    children: [
      { path: '', loadComponent: () => import('./org/org.page').then((m) => m.OrgPage) },
      { path: 'races', loadComponent: () => import('./org/races.page').then((m) => m.RacesPage) },
      { path: 'league', loadComponent: () => import('./org/league.page').then((m) => m.LeaguePage) },
      { path: 'settings', loadChildren: () => import('./org/settings/settings.routes').then((m) => m.SETTINGS_ROUTES) },
    ],
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account.shell').then((m) => m.AccountShell),
    children: [
      { path: '', loadComponent: () => import('./account/profile.tab').then((m) => m.ProfileTab) },
      { path: 'devices', loadComponent: () => import('./account/devices.tab').then((m) => m.DevicesTab) },
    ],
  },
  {
    path: 'catalog',
    loadComponent: () => import('./catalog/catalog.shell').then((m) => m.CatalogShell),
    children: [
      { path: '', loadComponent: () => import('./catalog/catalog.tab').then((m) => m.CatalogTab), data: { rarity: 'common' } },
      { path: 'rare', loadComponent: () => import('./catalog/catalog.tab').then((m) => m.CatalogTab), data: { rarity: 'rare' } },
      { path: 'epic', loadComponent: () => import('./catalog/catalog.tab').then((m) => m.CatalogTab), data: { rarity: 'epic' } },
      { path: 'legendary', loadComponent: () => import('./catalog/catalog.tab').then((m) => m.CatalogTab), data: { rarity: 'legendary' } },
      { path: 'limited', loadComponent: () => import('./catalog/catalog.tab').then((m) => m.CatalogTab), data: { rarity: 'limited' } },
    ],
  },
  { path: 'about', loadComponent: () => import('./info/about.page').then((m) => m.AboutPage) },
  { path: 'privacy', loadComponent: () => import('./info/privacy.page').then((m) => m.PrivacyPage) },
  { path: 'cli', loadComponent: () => import('./cli/cli-approve.page').then((m) => m.CliApprovePage) },
  // `token-derby link` opens /link; the page lives at /link-google.
  { path: 'link', redirectTo: 'link-google' },
  { path: 'link-google', loadComponent: () => import('./cli/link-google.page').then((m) => m.LinkGooglePage) },
  ...previewRoutes,
  { path: 'paddock', loadComponent: () => import('./paddock/paddock.page').then((m) => m.PaddockPage) },
  { path: '**', loadComponent: () => import('./not-found/not-found.page').then((m) => m.NotFoundPage) },
];
