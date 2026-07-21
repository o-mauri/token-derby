import type {
  CreateRaceRequest, CreateRaceResponse,
  GetRaceResponse, GetRaceSeriesResponse, JoinRaceRequest, JoinRaceResponse,
  HeartbeatRequest, HeartbeatResponse, EndRaceResponse,
  JoinOrganisationRequest, JoinOrganisationResponse,
  ListOrganisationsResponse, GetOrganisationResponse, GetOrgLeaderboardResponse,
  InitJockeyRequest, InitJockeyResponse,
  GetJockeyResponse, UpdateJockeyRequest, UpdateJockeyResponse,
  ListStableResponse, CreateStableHorseRequest, CreateStableHorseResponse,
  UpdateStableHorseRequest, UpdateStableHorseResponse, DeleteStableHorseResponse,
  RollHatResponse, EquipHatRequest, EquipHatResponse,
  WebSessionCreateResponse,
} from '@token-derby/shared';
import type { Transport } from './transport.js';

export function createEndpoints(t: Transport) {
  return {
    createRace(body: CreateRaceRequest) {
      return t.request<CreateRaceResponse>('POST', '/races', body, undefined);
    },

    getRace(joinCode: string) {
      return t.request<GetRaceResponse>('GET', `/races/${encodeURIComponent(joinCode)}`, undefined, undefined);
    },

    // Time-series token deltas per horse, for the token-over-time graph
    // (site's finished overlay; the desktop race-track window's chart faces).
    getRaceSeries(joinCode: string) {
      return t.request<GetRaceSeriesResponse>(
        'GET',
        `/races/${encodeURIComponent(joinCode)}/series`,
        undefined,
        undefined,
      );
    },

    joinRace(joinCode: string, body: JoinRaceRequest) {
      return t.request<JoinRaceResponse>('POST', `/races/${encodeURIComponent(joinCode)}/join`, body, undefined);
    },

    heartbeat(joinCode: string, horseId: string, token: string, body: HeartbeatRequest) {
      return t.request<HeartbeatResponse>(
        'POST',
        `/races/${encodeURIComponent(joinCode)}/horses/${encodeURIComponent(horseId)}/heartbeat`,
        body,
        token,
      );
    },

    endRace(adminCode: string) {
      return t.request<EndRaceResponse>('DELETE', `/races/admin/${encodeURIComponent(adminCode)}`, undefined, undefined);
    },

    joinOrganisation(body: JoinOrganisationRequest) {
      return t.request<JoinOrganisationResponse>('POST', '/organisations/join', body, undefined);
    },

    listOrganisations() {
      return t.request<ListOrganisationsResponse>('GET', '/organisations', undefined, undefined);
    },

    getOrganisation(orgName: string) {
      return t.request<GetOrganisationResponse>('GET', `/organisations/${encodeURIComponent(orgName)}`, undefined, undefined);
    },

    getOrgLeaderboard(orgName: string) {
      return t.request<GetOrgLeaderboardResponse>(
        'GET',
        `/organisations/${encodeURIComponent(orgName)}/leaderboard`,
        undefined,
        undefined,
      );
    },

    initJockey(body: InitJockeyRequest) {
      return t.request<InitJockeyResponse>('POST', '/jockey/init', body, undefined);
    },

    getJockey() {
      return t.request<GetJockeyResponse>('GET', '/jockey/me', undefined, undefined);
    },

    updateJockey(body: UpdateJockeyRequest) {
      return t.request<UpdateJockeyResponse>('PUT', '/jockey/me', body, undefined);
    },

    listStable() {
      return t.request<ListStableResponse>('GET', '/jockey/me/horses', undefined, undefined);
    },

    createStableHorse(body: CreateStableHorseRequest) {
      return t.request<CreateStableHorseResponse>('POST', '/jockey/me/horses', body, undefined);
    },

    updateStableHorse(stableHorseId: string, body: UpdateStableHorseRequest) {
      return t.request<UpdateStableHorseResponse>(
        'PUT',
        `/jockey/me/horses/${encodeURIComponent(stableHorseId)}`,
        body,
        undefined,
      );
    },

    deleteStableHorse(stableHorseId: string) {
      return t.request<DeleteStableHorseResponse>(
        'DELETE',
        `/jockey/me/horses/${encodeURIComponent(stableHorseId)}`,
        undefined,
        undefined,
      );
    },

    rollHat(stableHorseId: string) {
      return t.request<RollHatResponse>('POST', `/jockey/me/horses/${encodeURIComponent(stableHorseId)}/roll`, undefined, undefined);
    },

    equipHat(stableHorseId: string, body: EquipHatRequest) {
      return t.request<EquipHatResponse>('POST', `/jockey/me/horses/${encodeURIComponent(stableHorseId)}/equip`, body, undefined);
    },

    createWebSession() {
      return t.request<WebSessionCreateResponse>('POST', '/web-sessions', undefined, undefined);
    },
  };
}
