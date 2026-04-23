import { apiBase } from '../config.js';

export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
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

export async function request<T>(
  method: string,
  path: string,
  body: unknown,
  authToken: string | undefined,
  fetchImpl: FetchFn = fetch,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers: Record<string, string> = {};
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
