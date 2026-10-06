import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { AuthLinkStartResponse, ListDevicesResponse } from '@token-derby/shared';
import { WITH_SESSION } from '../session/session.interceptor';

const withSession = () => ({ context: new HttpContext().set(WITH_SESSION, true) });

/** Your CLI devices and the Google link hand-off. */
@Injectable()
export class AccountApi {
  private readonly http = inject(HttpClient);

  devices(): Promise<ListDevicesResponse> {
    return firstValueFrom(this.http.get<ListDevicesResponse>('/api/devices', withSession()));
  }

  async revokeDevice(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/devices/${encodeURIComponent(id)}`, withSession()));
  }

  linkStart(): Promise<AuthLinkStartResponse> {
    return firstValueFrom(this.http.post<AuthLinkStartResponse>('/api/auth/link/start', {}, withSession()));
  }
}
