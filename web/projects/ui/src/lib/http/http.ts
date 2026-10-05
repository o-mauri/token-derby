import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import { type HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { apiUrl } from '@token-derby/shared';

/** A failed API call: the server's error `code` when it sent one, otherwise NETWORK_ERROR. */
export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The page's hostname, which decides where the API lives; a token so tests can pretend to be production. */
export const API_HOSTNAME = new InjectionToken<string>('API_HOSTNAME', {
  factory: () => inject(DOCUMENT).defaultView?.location.hostname ?? '',
});

/** On the production hosts, `/api/...` goes straight to api.<domain>; elsewhere it stays same-origin. */
export const apiBaseUrl: HttpInterceptorFn = (req, next) => {
  const hostname = inject(API_HOSTNAME);
  const url = apiUrl(req.url, hostname);
  return next(url === req.url ? req : req.clone({ url }));
};

/** Every API failure becomes one ApiError, so pages branch on `code` rather than on HTTP details. */
export const apiErrors: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const body = err.error as { code?: unknown; message?: unknown } | null;
      const code = typeof body?.code === 'string' ? body.code : 'NETWORK_ERROR';
      const message = typeof body?.message === 'string' ? body.message : err.status ? `HTTP ${err.status}` : 'fetch failed';
      return throwError(() => new ApiError(code, message, err.status ?? 0));
    }),
  );
