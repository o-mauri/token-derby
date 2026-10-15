import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '@token-derby/ui';
import { AdminSession } from './admin-session';

const loginUrl = (router: Router, from: string) => router.createUrlTree(['/login'], { queryParams: { return_to: from } });

/** Adds the admin token to admin API calls; a 401 signs out and returns to login, once however many calls fail. */
export const adminAuth: HttpInterceptorFn = (req, next) => {
  const path = req.url.replace(/^https?:\/\/[^/]+/, '');
  if (!path.startsWith('/api/admin/') || path === '/api/admin/login') return next(req);
  const session = inject(AdminSession);
  const router = inject(Router);
  const token = session.token();
  const sent = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(sent).pipe(
    catchError((err: unknown) => {
      if (err instanceof ApiError && err.status === 401 && session.signedIn()) {
        session.clear();
        void router.navigateByUrl(loginUrl(router, router.url).toString());
      }
      return throwError(() => err);
    }),
  );
};

/** Signed-in admins only; anyone else goes to login, remembering where they were headed. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AdminSession).signedIn() ? true : loginUrl(router, state.url);
};

/** The login page is for signed-out visitors; a signed-in admin goes straight to Users. */
export const signedOutGuard: CanActivateFn = () => (inject(AdminSession).signedIn() ? inject(Router).parseUrl('/users') : true);
