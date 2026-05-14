import type {
  CreateRaceRequest, CreateRaceResponse,
  GetRaceResponse, JoinRaceRequest, JoinRaceResponse,
  HeartbeatRequest, HeartbeatResponse, EndRaceResponse,
  SpendTokenRequest, SpendTokenResponse,
} from '@token-derby/shared';
import { request } from './client.js';

export function createRace(body: CreateRaceRequest) {
  return request<CreateRaceResponse>('POST', '/races', body, undefined);
}

export function getRace(joinCode: string) {
  return request<GetRaceResponse>('GET', `/races/${encodeURIComponent(joinCode)}`, undefined, undefined);
}

export function joinRace(joinCode: string, body: JoinRaceRequest) {
  return request<JoinRaceResponse>('POST', `/races/${encodeURIComponent(joinCode)}/join`, body, undefined);
}

export function heartbeat(joinCode: string, horseId: string, token: string, body: HeartbeatRequest) {
  return request<HeartbeatResponse>(
    'POST',
    `/races/${encodeURIComponent(joinCode)}/horses/${encodeURIComponent(horseId)}/heartbeat`,
    body,
    token,
  );
}

export function endRace(adminCode: string) {
  return request<EndRaceResponse>('DELETE', `/races/admin/${encodeURIComponent(adminCode)}`, undefined, undefined);
}

export function spendToken(joinCode: string, horseId: string, heartbeatToken: string) {
  return request<SpendTokenResponse>(
    'POST',
    `/races/${encodeURIComponent(joinCode)}/horses/${encodeURIComponent(horseId)}/spend-token`,
    { heartbeat_token: heartbeatToken } satisfies SpendTokenRequest,
    undefined,
  );
}
