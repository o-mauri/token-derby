import { HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@token-derby/ui';
import { Session } from './session';

/** Set on requests that need the signed-in user. Others never carry the token, so public polls stay simple requests. */
export const WITH_SESSION = new HttpContextToken<boolean>(() => false);

/** Adds the bearer token to opted-in requests, and signs out when one of them comes back 401. */
export const sessionAuth: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(WITH_SESSION)) return next(req);
  const session = inject(Session);
  const token = session.token();
  const sent = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(sent).pipe(
    catchError((err: unknown) => {
      if (token && err instanceof ApiError && err.status === 401) session.clear();
      return throwError(() => err);
    }),
  );
};
