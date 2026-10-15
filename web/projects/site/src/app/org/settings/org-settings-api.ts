import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  GetOrgLeagueResponse, GetOrgRaceSettingsResponse, GetOrgScheduleResponse, GetOrgSlackResponse, GetOrgWebhookResponse,
  GetOrganisationResponse, OrgAccessSettings, OrgMembersResponse, RotateOrgJoinTokenResponse, SetOrgAccessResponse,
  SetOrgLeagueRequest, SetOrgRaceSettingsRequest, SetOrgRaceSettingsResponse, SetOrgScheduleRequest, SetOrgScheduleResponse,
  SetOrgSlackRequest, SetOrgWebhookResponse,
} from '@token-derby/shared';
import { WITH_SESSION } from '../../session/session.interceptor';

const opts = () => ({ context: new HttpContext().set(WITH_SESSION, true) });

/** Every org settings endpoint, as the signed-in owner. Errors arrive as ApiError. */
@Injectable()
export class OrgSettingsApi {
  private readonly http = inject(HttpClient);
  private url = (name: string, path = '') => `/api/organisations/${encodeURIComponent(name)}${path}`;
  private get = <T>(name: string, path = '') => firstValueFrom(this.http.get<T>(this.url(name, path), opts()));
  private put = <T>(name: string, path: string, body: unknown) => firstValueFrom(this.http.put<T>(this.url(name, path), body, opts()));
  private del = async (name: string, path: string) => { await firstValueFrom(this.http.delete(this.url(name, path), opts())); };

  org = (name: string) => this.get<GetOrganisationResponse>(name);
  members = (name: string) => this.get<OrgMembersResponse>(name, '/members');
  removeMember = (name: string, userId: string) => this.del(name, `/members/${encodeURIComponent(userId)}`);
  setAccess = (name: string, a: OrgAccessSettings) => this.put<SetOrgAccessResponse>(name, '/access', a);
  rotateToken = (name: string) => firstValueFrom(this.http.post<RotateOrgJoinTokenResponse>(this.url(name, '/join-token/rotate'), {}, opts()));
  schedule = (name: string) => this.get<GetOrgScheduleResponse>(name, '/schedule');
  setSchedule = (name: string, b: SetOrgScheduleRequest) => this.put<SetOrgScheduleResponse>(name, '/schedule', b);
  deleteSchedule = (name: string) => this.del(name, '/schedule');
  league = (name: string) => this.get<GetOrgLeagueResponse>(name, '/league');
  setLeague = (name: string, b: SetOrgLeagueRequest) => this.put<unknown>(name, '/league', b);
  deleteLeague = (name: string) => this.del(name, '/league');
  raceSettings = (name: string) => this.get<GetOrgRaceSettingsResponse>(name, '/race-settings');
  setRaceSettings = (name: string, b: SetOrgRaceSettingsRequest) => this.put<SetOrgRaceSettingsResponse>(name, '/race-settings', b);
  webhook = (name: string) => this.get<GetOrgWebhookResponse>(name, '/webhook');
  setWebhook = (name: string, url: string) => this.put<SetOrgWebhookResponse>(name, '/webhook', { url });
  deleteWebhook = (name: string) => this.del(name, '/webhook');
  slack = (name: string) => this.get<GetOrgSlackResponse>(name, '/slack');
  setSlack = async (name: string, b: SetOrgSlackRequest) => { await this.put<unknown>(name, '/slack', b); };
  deleteSlack = (name: string) => this.del(name, '/slack');
}
