import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { devicesVariant, previewDevices } from './account-fixture';

/** Answers the account endpoints from fixtures: ?devices=none|many|failed and &legacy pick the variant. */
export const accountFixtureInterceptor: HttpInterceptorFn = (req, next) => {
  const ok = (body: unknown, status = 200) => of(new HttpResponse({ status, body }));
  if (req.url === '/api/devices' && req.method === 'GET') {
    const variant = devicesVariant();
    if (variant === 'failed') return throwError(() => new HttpErrorResponse({ status: 500, error: { code: 'INTERNAL', message: 'preview' }, url: req.url }));
    return ok(previewDevices(variant));
  }
  if (req.url.startsWith('/api/devices/') && req.method === 'DELETE') return ok({ ok: true });
  if (req.url === '/api/jockey/me' && req.method === 'PUT') {
    const { display_name } = req.body as { display_name: string };
    return ok({ user_id: 'u1', display_name: display_name.trim() });
  }
  if (req.url === '/api/auth/link/start') return ok({ authorize_url: '#' });
  if (req.url === '/api/web-sessions' && req.method === 'DELETE') return ok(null, 204);
  return next(req);
};
