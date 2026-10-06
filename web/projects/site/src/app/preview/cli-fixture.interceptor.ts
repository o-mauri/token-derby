import { DOCUMENT, inject } from '@angular/core';
import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import type { ResolveFn } from '@angular/router';
import { of, throwError } from 'rxjs';

const ERRORS: Record<string, [string, number]> = {
  not_found: ['CLI_AUTH_NOT_FOUND', 404],
  wrong_account: ['CLI_AUTH_WRONG_ACCOUNT', 403],
  rate_limited: ['RATE_LIMITED', 429],
};

const query = () => new URLSearchParams(inject(DOCUMENT).defaultView?.location.search ?? '');

/** Answers the CLI approve endpoint: a device called "omar-mbp", or the error named by ?error=. */
export const cliFixtureInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url !== '/api/auth/cli/approve') return next(req);
  const error = ERRORS[query().get('error') ?? ''];
  if (error) return throwError(() => new HttpErrorResponse({ status: error[1], error: { code: error[0], message: 'preview' }, url: req.url }));
  return of(new HttpResponse({ status: 200, body: { label: 'omar-mbp' } }));
};

/** ?step=confirm|done opens the preview part-way through. */
export const previewCliStep: ResolveFn<string | undefined> = (route) => {
  const step = route.queryParamMap.get('step');
  return step === 'confirm' || step === 'done' ? step : undefined;
};
export const previewCliLabel: ResolveFn<string | undefined> = (route) => (route.queryParamMap.get('step') === 'confirm' ? 'omar-mbp' : undefined);
