import type { GetRaceResponse, ListOrgRacesResponse } from '@token-derby/shared';

export type ApiErrorCode =
  | 'RACE_NOT_FOUND'
  | 'RACE_FULL'
  | 'RACE_FINISHED'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'ORG_NOT_FOUND';

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

async function getJson<T>(url: string, fetchImpl: FetchFn): Promise<T> {
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await fetchImpl(url);
  } catch (e: any) {
    throw new ApiError('NETWORK_ERROR', e?.message ?? 'fetch failed', 0);
  }
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  let parsed: any = null;
  if (contentType.includes('application/json') && text.length > 0) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }
  if (!res.ok) {
    if (parsed && typeof parsed.code === 'string') {
      throw new ApiError(parsed.code as ApiErrorCode, parsed.message ?? 'API error', res.status);
    }
    throw new ApiError('NETWORK_ERROR', `HTTP ${res.status}`, res.status);
  }
  return parsed as T;
}

export function fetchRace(
  joinCode: string,
  fetchImpl: FetchFn = fetch,
): Promise<GetRaceResponse> {
  return getJson<GetRaceResponse>(`/api/races/${encodeURIComponent(joinCode)}`, fetchImpl);
}

export function fetchOrgRaces(
  orgName: string,
  fetchImpl: FetchFn = fetch,
): Promise<ListOrgRacesResponse> {
  return getJson<ListOrgRacesResponse>(
    `/api/organisations/${encodeURIComponent(orgName)}/races`,
    fetchImpl,
  );
}
