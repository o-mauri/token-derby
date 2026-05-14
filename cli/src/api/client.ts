import { apiBase } from '../config.js';
import { CLI_VERSION } from '../version.js';
import { CLI_VERSION_HEADER, USER_ID_HEADER, USER_NAME_HEADER } from '@token-derby/shared';
import { loadIdentity, type Identity } from '../identity/identity.js';

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
  authToken: string | undefined,
  fetchImpl: FetchFn = fetch,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers: Record<string, string> = {};
  headers[CLI_VERSION_HEADER] = CLI_VERSION;
  const identity = await getIdentity();
  if (identity) {
    headers[USER_ID_HEADER] = identity.user_id;
    headers[USER_NAME_HEADER] = identity.display_name;
  }
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }

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

  return parsed as T;
}
