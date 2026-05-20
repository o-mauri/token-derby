import type {
  CreateRaceRequest, CreateRaceResponse,
  GetRaceResponse, JoinRaceRequest, JoinRaceResponse,
  HeartbeatRequest, HeartbeatResponse, EndRaceResponse,
  CreateOrganisationRequest, CreateOrganisationResponse,
  JoinOrganisationRequest, JoinOrganisationResponse,
  ListOrganisationsResponse, GetOrganisationResponse,
  InitJockeyRequest, InitJockeyResponse,
  GetJockeyResponse, UpdateJockeyRequest, UpdateJockeyResponse,
  ListStableResponse, CreateStableHorseRequest, CreateStableHorseResponse,
  UpdateStableHorseRequest, UpdateStableHorseResponse, DeleteStableHorseResponse,
  SetOrgWebhookRequest, SetOrgWebhookResponse,
  GetOrgWebhookResponse, DeleteOrgWebhookResponse,
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

export function createOrganisation(body: CreateOrganisationRequest) {
  return request<CreateOrganisationResponse>('POST', '/organisations', body, undefined);
}

export function joinOrganisation(body: JoinOrganisationRequest) {
  return request<JoinOrganisationResponse>('POST', '/organisations/join', body, undefined);
}

export function listOrganisations() {
  return request<ListOrganisationsResponse>('GET', '/organisations', undefined, undefined);
}

export function getOrganisation(name: string) {
  return request<GetOrganisationResponse>('GET', `/organisations/${encodeURIComponent(name)}`, undefined, undefined);
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

export function setOrgWebhook(orgName: string, body: SetOrgWebhookRequest) {
  return request<SetOrgWebhookResponse>(
    'PUT',
    `/organisations/${encodeURIComponent(orgName)}/webhook`,
    body,
    undefined,
  );
}

export function getOrgWebhook(orgName: string) {
  return request<GetOrgWebhookResponse>(
    'GET',
    `/organisations/${encodeURIComponent(orgName)}/webhook`,
    undefined,
    undefined,
  );
}

export function deleteOrgWebhook(orgName: string) {
  return request<DeleteOrgWebhookResponse>(
    'DELETE',
    `/organisations/${encodeURIComponent(orgName)}/webhook`,
    undefined,
    undefined,
  );
}
