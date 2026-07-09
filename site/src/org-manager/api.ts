import type {
  WebSessionExchangeResponse, ListOrganisationsResponse, GetOrganisationResponse,
  OrgMembersResponse, GetOrgScheduleResponse, SetOrgScheduleRequest, SetOrgScheduleResponse,
  GetOrgWebhookResponse, SetOrgWebhookResponse, CreateOrganisationResponse,
  JoinOrganisationResponse,
  GetOrgLeagueResponse, SetOrgLeagueRequest, SetOrgLeagueResponse, DeleteOrgLeagueResponse,
} from '@token-derby/shared';
import { getSession, setSession, clearSession } from './session.js';

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

async function authed<T>(method: string, path: string, body: unknown, fetchImpl: FetchFn): Promise<T> {
  const token = getSession();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Not signed in', 401);
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res: Response;
  try { res = await fetchImpl(path, init); }
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

export async function logout(fetchImpl: FetchFn = fetch): Promise<void> {
  const token = getSession();
  if (token) {
    try { await fetchImpl('/api/web-sessions', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }); }
    catch { /* best-effort */ }
  }
  clearSession();
}

export const listOrganisations = (f: FetchFn = fetch) =>
  authed<ListOrganisationsResponse>('GET', '/api/organisations', undefined, f);
export const getOrganisation = (name: string, f: FetchFn = fetch) =>
  authed<GetOrganisationResponse>('GET', `/api/organisations/${u(name)}`, undefined, f);
export const getMembers = (name: string, f: FetchFn = fetch) =>
  authed<OrgMembersResponse>('GET', `/api/organisations/${u(name)}/members`, undefined, f);
export const getSchedule = (name: string, f: FetchFn = fetch) =>
  authed<GetOrgScheduleResponse>('GET', `/api/organisations/${u(name)}/schedule`, undefined, f);
export const setSchedule = (name: string, body: SetOrgScheduleRequest, f: FetchFn = fetch) =>
  authed<SetOrgScheduleResponse>('PUT', `/api/organisations/${u(name)}/schedule`, body, f);
export const clearSchedule = (name: string, f: FetchFn = fetch) =>
  authed<{ deleted?: boolean }>('DELETE', `/api/organisations/${u(name)}/schedule`, undefined, f);
export const getLeague = (name: string, f: FetchFn = fetch) =>
  authed<GetOrgLeagueResponse>('GET', `/api/organisations/${u(name)}/league`, undefined, f);
export const setLeague = (name: string, body: SetOrgLeagueRequest, f: FetchFn = fetch) =>
  authed<SetOrgLeagueResponse>('PUT', `/api/organisations/${u(name)}/league`, body, f);
export const clearLeague = (name: string, f: FetchFn = fetch) =>
  authed<DeleteOrgLeagueResponse>('DELETE', `/api/organisations/${u(name)}/league`, undefined, f);
export const getWebhook = (name: string, f: FetchFn = fetch) =>
  authed<GetOrgWebhookResponse>('GET', `/api/organisations/${u(name)}/webhook`, undefined, f);
export const setWebhook = (name: string, url: string, f: FetchFn = fetch) =>
  authed<SetOrgWebhookResponse>('PUT', `/api/organisations/${u(name)}/webhook`, { url }, f);
export const clearWebhook = (name: string, f: FetchFn = fetch) =>
  authed<{ deleted?: boolean }>('DELETE', `/api/organisations/${u(name)}/webhook`, undefined, f);
export const createOrganisation = (name: string, f: FetchFn = fetch) =>
  authed<CreateOrganisationResponse>('POST', '/api/organisations', { name }, f);
export const joinOrganisation = (token: string, f: FetchFn = fetch) =>
  authed<JoinOrganisationResponse>('POST', '/api/organisations/join', { join_token: token }, f);
