import type { CanMatchFn, Routes } from '@angular/router';

const RACE_CODE = /^[A-Za-z0-9]+$/;

/** Only well-formed join codes reach the race page; anything else falls through to not-found. */
export const raceCodeGuard: CanMatchFn = (_route, segments) => RACE_CODE.test(segments[1]?.path ?? '');

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./home/home.page').then((m) => m.HomePage) },
  { path: 'race/:code', canMatch: [raceCodeGuard], loadComponent: () => import('./race/race.page').then((m) => m.RacePage) },
  { path: '**', loadComponent: () => import('./not-found/not-found.page').then((m) => m.NotFoundPage) },
];
