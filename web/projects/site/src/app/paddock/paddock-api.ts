import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { GetJockeyResponse, ListStableResponse } from '@token-derby/shared';
import { WITH_SESSION } from '../session/session.interceptor';

const withSession = () => ({ context: new HttpContext().set(WITH_SESSION, true) });

/** Your own jockey and stable, read with the website session. */
@Injectable({ providedIn: 'root' })
export class PaddockApi {
  private readonly http = inject(HttpClient);

  jockey(): Promise<GetJockeyResponse> {
    return firstValueFrom(this.http.get<GetJockeyResponse>('/api/jockey/me', withSession()));
  }

  stable(): Promise<ListStableResponse> {
    return firstValueFrom(this.http.get<ListStableResponse>('/api/jockey/me/horses', withSession()));
  }
}
