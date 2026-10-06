import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type {
  AdminClaimRedemptionsResponse, AdminClaimsResponse, AdminLoginResponse, AdminOrgsResponse, AdminUsersResponse,
  CreateClaimRequest, CreateClaimResponse, StableHorse,
} from '@token-derby/shared';

const u = encodeURIComponent;

/** The admin API, one method per endpoint; the auth interceptor adds the token. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private send<T>(o: Observable<T>): Promise<T> { return firstValueFrom(o); }

  login(username: string, password: string): Promise<AdminLoginResponse> {
    return this.send(this.http.post<AdminLoginResponse>('/api/admin/login', { username, password }));
  }
  users(): Promise<AdminUsersResponse> { return this.send(this.http.get<AdminUsersResponse>('/api/admin/users')); }
  organisations(): Promise<AdminOrgsResponse> { return this.send(this.http.get<AdminOrgsResponse>('/api/admin/organisations')); }
  renameUser(uid: string, display_name: string): Promise<{ user_id: string; display_name: string }> {
    return this.send(this.http.put<{ user_id: string; display_name: string }>(`/api/admin/users/${u(uid)}`, { display_name }));
  }
  renameHorse(uid: string, hid: string, name: string): Promise<StableHorse> {
    return this.send(this.http.put<StableHorse>(`/api/admin/users/${u(uid)}/horses/${u(hid)}`, { name }));
  }
  removeHat(uid: string, hid: string, index: number): Promise<StableHorse> {
    return this.send(this.http.delete<StableHorse>(`/api/admin/users/${u(uid)}/horses/${u(hid)}/hats/${index}`));
  }
  deleteHorse(uid: string, hid: string): Promise<{ deleted: boolean }> {
    return this.send(this.http.delete<{ deleted: boolean }>(`/api/admin/users/${u(uid)}/horses/${u(hid)}`));
  }
  claims(): Promise<AdminClaimsResponse> { return this.send(this.http.get<AdminClaimsResponse>('/api/admin/claims')); }
  createClaim(body: CreateClaimRequest): Promise<CreateClaimResponse> {
    return this.send(this.http.post<CreateClaimResponse>('/api/admin/claims', body));
  }
  redemptions(code: string): Promise<AdminClaimRedemptionsResponse> {
    return this.send(this.http.get<AdminClaimRedemptionsResponse>(`/api/admin/claims/${u(code)}/redemptions`));
  }
}
