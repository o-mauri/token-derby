import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { Route, Routes } from '@angular/router';
import { apiErrors } from '@token-derby/ui';
import { RaceApi } from '../race/race-api';
import { fixtureInterceptor } from './fixture.interceptor';
import { PREVIEW_JOIN_CODE } from './race-fixture';

// Each preview gets its own HttpClient and RaceApi, so the fixtures never reach the real app's requests.
const race = (path: string): Route => ({
  path,
  providers: [provideHttpClient(withInterceptors([apiErrors, fixtureInterceptor])), RaceApi],
  data: { code: PREVIEW_JOIN_CODE },
  loadComponent: () => import('../race/race.page').then((m) => m.RacePage),
});

/** Fixture-backed previews of real pages. Production builds swap this file for preview.routes.prod.ts. */
export const previewRoutes: Routes = [race('preview-race'), race('preview-loader'), race('preview-not-found')];
