import type {
  AdminLoginResponse,
  AdminUsersResponse,
  AdminOrgsResponse,
  StableHorse,
} from '@token-derby/shared';
import { getToken } from './auth.js';

export type ApiErrorCode = 'BAD_REQUEST' | 'UNAUTHENTICATED' | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode | string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchFn = typeof fetch;

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const ct = res.headers.get('content-type') ?? '';
  let body: any = null;
  if (ct.includes('application/json') && text.length > 0) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  if (!res.ok) {
    const code = body && typeof body.code === 'string' ? body.code : 'NETWORK_ERROR';
    throw new ApiError(code, body?.message ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export async function login(
  username: string,
  password: string,
  fetchImpl: FetchFn = fetch,
): Promise<AdminLoginResponse> {
  let res: Response;
  try {
    res = await fetchImpl('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  return parse<AdminLoginResponse>(res);
}

async function authedGet<T>(url: string, fetchImpl: FetchFn): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  return parse<T>(res);
}

export function fetchUsers(fetchImpl: FetchFn = fetch): Promise<AdminUsersResponse> {
  return authedGet<AdminUsersResponse>('/api/admin/users', fetchImpl);
}

export function fetchOrganisations(fetchImpl: FetchFn = fetch): Promise<AdminOrgsResponse> {
  return authedGet<AdminOrgsResponse>('/api/admin/organisations', fetchImpl);
}

async function authedSend<T>(
  method: string,
  url: string,
  body: unknown,
  fetchImpl: FetchFn,
): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  return parse<T>(res);
}

const u = (s: string) => encodeURIComponent(s);

export function renameUser(
  userId: string, name: string, fetchImpl: FetchFn = fetch,
): Promise<{ user_id: string; display_name: string }> {
  return authedSend('PUT', `/api/admin/users/${u(userId)}`, { display_name: name }, fetchImpl);
}

export function renameHorse(
  userId: string, horseId: string, name: string, fetchImpl: FetchFn = fetch,
): Promise<StableHorse> {
  return authedSend('PUT', `/api/admin/users/${u(userId)}/horses/${u(horseId)}`, { name }, fetchImpl);
}

export function removeHat(
  userId: string, horseId: string, index: number, fetchImpl: FetchFn = fetch,
): Promise<StableHorse> {
  return authedSend('DELETE', `/api/admin/users/${u(userId)}/horses/${u(horseId)}/hats/${index}`, undefined, fetchImpl);
}

export function deleteHorse(
  userId: string, horseId: string, fetchImpl: FetchFn = fetch,
): Promise<{ deleted: boolean }> {
  return authedSend('DELETE', `/api/admin/users/${u(userId)}/horses/${u(horseId)}`, undefined, fetchImpl);
}
