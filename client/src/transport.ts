import {
  type ClientId,
  CLI_VERSION_HEADER,
  CLIENT_HEADER,
  CLIENT_VERSION_HEADER,
  USER_ID_HEADER,
  USER_TOKEN_HEADER,
} from '@token-derby/shared';
import { ApiError, type ApiErrorCode } from './errors.js';

type FetchFn = typeof fetch;

export type Identity = { user_id: string; secret_token: string };

export type ClientConfig = {
  baseUrl: string | (() => string);
  client: ClientId;
  clientVersion: string;
  raceCompatVersion?: string;
  getIdentity: () => Promise<Identity | null>;
  fetchImpl?: FetchFn;
};

export type Transport = {
  request<T>(
    method: string,
    path: string,
    body: unknown,
    horseAuthToken?: string,
    fetchImpl?: FetchFn,
  ): Promise<T>;
};

export function createTransport(config: ClientConfig): Transport {
  return {
    async request<T>(
      method: string,
      path: string,
      body: unknown,
      horseAuthToken: string | undefined,
      fetchImpl?: FetchFn,
    ): Promise<T> {
      const base = typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl;
      const url = path.startsWith('http') ? path : `${base}${path}`;
      const headers: Record<string, string> = {};

      if (config.client === 'desktop') {
        headers[CLIENT_HEADER] = 'desktop';
        headers[CLIENT_VERSION_HEADER] = config.clientVersion;
        headers['user-agent'] = `token-derby-desktop/${config.clientVersion}`;
        if (config.raceCompatVersion) headers[CLI_VERSION_HEADER] = config.raceCompatVersion;
      } else {
        headers[CLI_VERSION_HEADER] = config.clientVersion;
        headers['user-agent'] = `token-derby/${config.clientVersion}`;
      }

      const identity = await config.getIdentity();
      if (identity) {
        headers[USER_ID_HEADER] = identity.user_id;
        headers[USER_TOKEN_HEADER] = identity.secret_token;
      }
      if (horseAuthToken) headers['authorization'] = `Bearer ${horseAuthToken}`;
      if (body !== undefined) headers['content-type'] = 'application/json';

      const doFetch = fetchImpl ?? config.fetchImpl ?? fetch;

      let res: Awaited<ReturnType<FetchFn>>;
      try {
        res = await doFetch(url, {
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
    },
  };
}
