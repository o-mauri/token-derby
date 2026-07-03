import type {
  CreateRaceRequest, CreateRaceResponse,
  GetRaceResponse, JoinRaceRequest, JoinRaceResponse,
  HeartbeatRequest, HeartbeatResponse, EndRaceResponse,
  JoinOrganisationRequest, JoinOrganisationResponse,
  ListOrganisationsResponse,
  InitJockeyRequest, InitJockeyResponse,
  GetJockeyResponse, UpdateJockeyRequest, UpdateJockeyResponse,
  ListStableResponse, CreateStableHorseRequest, CreateStableHorseResponse,
  UpdateStableHorseRequest, UpdateStableHorseResponse, DeleteStableHorseResponse,
  RollHatResponse, EquipHatRequest, EquipHatResponse,
  WebSessionCreateResponse,
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

export function joinOrganisation(body: JoinOrganisationRequest) {
  return request<JoinOrganisationResponse>('POST', '/organisations/join', body, undefined);
}

export function listOrganisations() {
  return request<ListOrganisationsResponse>('GET', '/organisations', undefined, undefined);
}

export function initJockey(body: InitJockeyRequest) {
  return request<InitJockeyResponse>('POST', '/jockey/init', body, undefined);
}

export function getJockey() {
  return request<GetJockeyResponse>('GET', '/jockey/me', undefined, undefined);
}

export function updateJockey(body: UpdateJockeyRequest) {
  return request<UpdateJockeyResponse>('PUT', '/jockey/me', body, undefined);
}

export function listStable() {
  return request<ListStableResponse>('GET', '/jockey/me/horses', undefined, undefined);
}

export function createStableHorse(body: CreateStableHorseRequest) {
  return request<CreateStableHorseResponse>('POST', '/jockey/me/horses', body, undefined);
}

export function updateStableHorse(stableHorseId: string, body: UpdateStableHorseRequest) {
  return request<UpdateStableHorseResponse>(
    'PUT',
    `/jockey/me/horses/${encodeURIComponent(stableHorseId)}`,
    body,
    undefined,
  );
}

export function deleteStableHorse(stableHorseId: string) {
  return request<DeleteStableHorseResponse>(
    'DELETE',
    `/jockey/me/horses/${encodeURIComponent(stableHorseId)}`,
    undefined,
    undefined,
  );
}

export function rollHat(stableHorseId: string) {
  return request<RollHatResponse>('POST', `/jockey/me/horses/${encodeURIComponent(stableHorseId)}/roll`, undefined, undefined);
}

export function equipHat(stableHorseId: string, body: EquipHatRequest) {
  return request<EquipHatResponse>('POST', `/jockey/me/horses/${encodeURIComponent(stableHorseId)}/equip`, body, undefined);
}

export function createWebSession() {
  return request<WebSessionCreateResponse>('POST', '/web-sessions', undefined, undefined);
}
