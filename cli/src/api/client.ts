import { apiBase } from '../config.js';
import { CLI_VERSION } from '../version.js';
import { CLI_VERSION_HEADER, USER_ID_HEADER, USER_TOKEN_HEADER } from '@token-derby/shared';
import { loadIdentity, type Identity } from '../identity/identity.js';
import { logInfo, logError } from '../log/logger.js';

export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'VERSION_MISMATCH'
  | 'IDENTITY_REQUIRED'
  | 'DUPLICATE_HORSE'
  | 'ORG_NAME_TAKEN'
  | 'ORG_NOT_FOUND'
  | 'NOT_ORG_MEMBER'
  | 'UNAUTHENTICATED'
  | 'STABLE_HORSE_NOT_FOUND'
  | 'STABLE_HORSE_NAME_TAKEN'
  | 'INSUFFICIENT_ROLLS'
  | 'CLAIM_NOT_FOUND'
  | 'CLAIM_ALREADY_REDEEMED'
  | 'CLAIM_EXHAUSTED'
  | 'CLAIM_EXPIRED'
  | 'CLI_AUTH_NOT_FOUND'
  | 'CLI_AUTH_WRONG_ACCOUNT'
  | 'DEVICE_NOT_FOUND'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchFn = typeof fetch;

// Most path segments are ids or join codes, which are worth having in the log.
// A claim token and an admin code are credentials that happen to travel in the
// URL, so those segments are masked before anything is written.
const SECRET_SEGMENT = /^\/(claims|races\/admin)\/[^/]+/;

export function loggablePath(path: string): string {
  return path.replace(SECRET_SEGMENT, (match) => `${match.slice(0, match.lastIndexOf('/') + 1)}[redacted]`);
}

let identityCache: Promise<Identity | null> | null = null;
function getIdentity(): Promise<Identity | null> {
  if (!identityCache) identityCache = loadIdentity();
  return identityCache;
}

// Tests can reset the cached identity.
export function _resetIdentityCacheForTests(): void {
  identityCache = null;
}

export async function request<T>(
  method: string,
  path: string,
  body: unknown,
  horseAuthToken: string | undefined,
  fetchImpl: FetchFn = fetch,
  // Used only by the login flow's device revoke: a device_code/token pair
  // it holds before any identity.json exists to load, so the usual
  // cached-identity lookup has nothing to attach.
  identityOverride?: { user_id: string; secret_token: string },
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers: Record<string, string> = {};
  headers[CLI_VERSION_HEADER] = CLI_VERSION;
  headers['user-agent'] = `token-derby/${CLI_VERSION}`;
  const identity = identityOverride ?? await getIdentity();
  if (identity) {
    headers[USER_ID_HEADER] = identity.user_id;
    headers[USER_TOKEN_HEADER] = identity.secret_token;
  }
  if (horseAuthToken) headers['authorization'] = `Bearer ${horseAuthToken}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  // Method, path and timing only. Headers carry credentials and bodies carry
  // scores, so neither is ever written to the log.
  const safePath = loggablePath(path);
  logInfo('http.req', { method, path: safePath });
  const startedAt = Date.now();

  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    logError('http.err', { method, path: safePath, ms: Date.now() - startedAt, message: e?.message ?? 'fetch failed' });
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  logInfo('http.res', { method, path: safePath, status: res.status, ms: Date.now() - startedAt });

  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let parsed: any = null;
  if (contentType.includes('application/json') && text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (parsed && typeof parsed.code === 'string') {
      throw new ApiError(parsed.code as ApiErrorCode, parsed.message ?? 'API error', res.status);
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${res.status}`, res.status);
  }

  // A 2xx with no parseable JSON must not be handed back as `null as T` — every
  // caller dereferences the result, so the failure would surface as a TypeError
  // somewhere far from here. CloudFront's SPA fallback turns 403/404 into
  // `200 text/html`, which is exactly how this happens in production.
  if (parsed === null) {
    const got = contentType || 'no content-type';
    throw new ApiError(
      'NETWORK_ERROR',
      `Expected JSON from ${method} ${safePath} but the server returned ${got} (HTTP ${res.status}). The API may be unavailable or the request was rejected upstream.`,
      res.status,
    );
  }

  return parsed as T;
}
