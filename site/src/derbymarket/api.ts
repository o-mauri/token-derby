import type {
  WebSessionExchangeResponse, ListOrganisationsResponse,
  GetMarketsResponse, GetMarketHistoryResponse,
} from '@token-derby/shared';
import { getSession, setSession } from './session.js';

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchFn = typeof fetch;
const u = (s: string) => encodeURIComponent(s);

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

async function get<T>(path: string, fetchImpl: FetchFn): Promise<T> {
  let res: Response;
  try { res = await fetchImpl(path); }
  catch (e: any) { throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0); }
  return parse<T>(res);
}

async function authed<T>(path: string, fetchImpl: FetchFn): Promise<T> {
  const token = getSession();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  let res: Response;
  try { res = await fetchImpl(path, { headers: { authorization: `Bearer ${token}` } }); }
  catch (e: any) { throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0); }
  return parse<T>(res);
}

export async function exchangeCode(code: string, fetchImpl: FetchFn = fetch): Promise<WebSessionExchangeResponse> {
  let res: Response;
  try {
    res = await fetchImpl('/api/web-sessions/exchange', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
  } catch (e: any) { throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0); }
  const out = await parse<WebSessionExchangeResponse>(res);
  setSession(out.token);
  return out;
}

export const listOrganisations = (f: FetchFn = fetch) =>
  authed<ListOrganisationsResponse>('/api/organisations', f);

export const getMarkets = (joinCode: string, f: FetchFn = fetch) =>
  get<GetMarketsResponse>(`/api/races/${u(joinCode)}/markets`, f);

export const getMarketHistory = (joinCode: string, f: FetchFn = fetch) =>
  get<GetMarketHistoryResponse>(`/api/races/${u(joinCode)}/markets/history`, f);
