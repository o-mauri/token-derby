import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GetLeagueStandingsResponse, ListOrgRacesResponse } from '@token-derby/shared';

/** The org endpoints the dashboard and races page read. Errors arrive as ApiError via the interceptors. */
@Injectable()
export class OrgApi {
  private readonly http = inject(HttpClient);

  races(name: string): Promise<ListOrgRacesResponse> {
    return firstValueFrom(this.http.get<ListOrgRacesResponse>(`/api/organisations/${encodeURIComponent(name)}/races`));
  }

  standings(name: string): Promise<GetLeagueStandingsResponse> {
    return firstValueFrom(this.http.get<GetLeagueStandingsResponse>(`/api/organisations/${encodeURIComponent(name)}/league/standings`));
  }
}
