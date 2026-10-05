import { DOCUMENT, inject } from '@angular/core';
import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { NEVER, of, throwError } from 'rxjs';
import { PREVIEW_JOIN_CODE, PREVIEW_SERIES, type PreviewRaceState, previewRace } from './race-fixture';

const STATES: readonly PreviewRaceState[] = ['live', 'pending', 'finished'];

/** Answers the race endpoints from fixtures. The path picks loading or not-found; ?state= picks the race state. */
export const fixtureInterceptor: HttpInterceptorFn = (req, next) => {
  const location = inject(DOCUMENT).defaultView?.location;
  const base = `/api/races/${PREVIEW_JOIN_CODE}`;
  if (!req.url.startsWith('/api/')) return next(req);
  if (location?.pathname === '/preview-loader') return NEVER;
  if (location?.pathname === '/preview-not-found' && req.url === base) {
    return throwError(() => new HttpErrorResponse({
      status: 404, url: req.url, error: { code: 'RACE_NOT_FOUND', message: 'Race not found' },
    }));
  }
  const asked = new URLSearchParams(location?.search ?? '').get('state') as PreviewRaceState | null;
  const state = asked && STATES.includes(asked) ? asked : 'live';
  if (req.url === `${base}/series`) return of(new HttpResponse({ status: 200, body: PREVIEW_SERIES }));
  if (req.url === base) return of(new HttpResponse({ status: 200, body: previewRace(state) }));
  if (req.url.includes('/league/standings')) return of(new HttpResponse({ status: 200, body: { standings: null } }));
  return next(req);
};
