import { apiBase } from '../config.js';
import { CLI_VERSION } from '../version.js';
import { loadIdentity, type Identity } from '../identity/identity.js';
import { createTransport, ApiError, type ApiErrorCode } from '@token-derby/client';

export { ApiError, type ApiErrorCode } from '@token-derby/client';

let identityCache: Promise<Identity | null> | null = null;

// Tests can reset the cached identity.
export function _resetIdentityCacheForTests(): void {
  identityCache = null;
}

const transport = createTransport({
  baseUrl: () => apiBase(),
  client: 'cli',
  clientVersion: CLI_VERSION,
  getIdentity: async () => {
    if (!identityCache) identityCache = loadIdentity();
    const id = await identityCache;
    return id ? { user_id: id.user_id, secret_token: id.secret_token } : null;
  },
});

export function request<T>(
  method: string,
  path: string,
  body: unknown,
  horseAuthToken?: string,
  fetchImpl?: typeof fetch,
): Promise<T> {
  return transport.request<T>(method, path, body, horseAuthToken, fetchImpl);
}
