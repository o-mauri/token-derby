import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { homePreviewState, previewMyOrgs } from './home-fixture';

/** Answers "my orgs" and sign-out from fixtures. ?signed=out|in|empty|many|failed picks the variant. */
export const homeFixtureInterceptor: HttpInterceptorFn = (req, next) => {
  const state = homePreviewState();
  if (req.url === '/api/organisations' && req.method === 'GET') {
    if (state === 'failed') return throwError(() => new HttpErrorResponse({ status: 500, error: { code: 'INTERNAL', message: 'preview' }, url: req.url }));
    return of(new HttpResponse({ status: 200, body: previewMyOrgs(state) }));
  }
  if (req.url === '/api/web-sessions' && req.method === 'DELETE') return of(new HttpResponse({ status: 204 }));
  return next(req);
};
