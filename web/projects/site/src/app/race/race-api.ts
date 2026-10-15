import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GetLeagueStandingsResponse, GetRaceResponse, GetRaceSeriesResponse } from '@token-derby/shared';

/** The race endpoints the race page reads. Errors arrive as ApiError via the interceptors. */
@Injectable({ providedIn: 'root' })
export class RaceApi {
  private readonly http = inject(HttpClient);

  race(code: string): Promise<GetRaceResponse> {
    return firstValueFrom(this.http.get<GetRaceResponse>(`/api/races/${encodeURIComponent(code)}`));
  }

  series(code: string): Promise<GetRaceSeriesResponse> {
    return firstValueFrom(this.http.get<GetRaceSeriesResponse>(`/api/races/${encodeURIComponent(code)}/series`));
  }

  standings(org: string, season: number): Promise<GetLeagueStandingsResponse> {
    return firstValueFrom(
      this.http.get<GetLeagueStandingsResponse>(`/api/organisations/${encodeURIComponent(org)}/league/standings?season=${season}`),
    );
  }
}
