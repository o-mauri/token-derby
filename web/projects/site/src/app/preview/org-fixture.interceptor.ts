import { DOCUMENT, inject } from '@angular/core';
import { HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { of } from 'rxjs';
import { PREVIEW_JOIN_CODE } from './race-fixture';
import { type OrgPreviewOptions, PREVIEW_ORG, previewLiveRace, previewOrgRaces, previewOrgStandings } from './org-fixture';

/** Answers the org endpoints from fixtures. ?state=live|next|none, &league=none and &long pick the variant. */
export const orgFixtureInterceptor: HttpInterceptorFn = (req, next) => {
  const params = new URLSearchParams(inject(DOCUMENT).defaultView?.location.search ?? '');
  const state = params.get('state');
  const opts: OrgPreviewOptions = {
    state: state === 'next' || state === 'none' ? state : 'live',
    league: params.get('league') !== 'none',
    long: params.has('long'),
  };
  const base = `/api/organisations/${PREVIEW_ORG}`;
  const ok = (body: unknown) => of(new HttpResponse({ status: 200, body }));
  if (req.url === `${base}/races`) return ok(previewOrgRaces(opts));
  if (req.url.startsWith(`${base}/league/standings`)) return ok({ standings: previewOrgStandings(opts) });
  if (req.url === `/api/races/${PREVIEW_JOIN_CODE}`) return ok(previewLiveRace(opts));
  return next(req);
};
