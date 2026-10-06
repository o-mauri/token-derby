import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ListOrganisationsResponse, OrganisationSummary } from '@token-derby/shared';
import type { OrgLink } from '@token-derby/ui';
import { WITH_SESSION } from '../session/session.interceptor';

/** The signed-in user's orgs. */
@Injectable()
export class HomeApi {
  private readonly http = inject(HttpClient);

  myOrgs(): Promise<ListOrganisationsResponse> {
    return firstValueFrom(this.http.get<ListOrganisationsResponse>('/api/organisations', { context: new HttpContext().set(WITH_SESSION, true) }));
  }
}

export const AUTH_ERROR_TEXT: Record<string, string> = {
  sso_failed: "Couldn't sign you in with Google. Try again.",
  expired: 'That sign-in took too long. Try again.',
  email_already_linked: 'That Google account is already linked to another jockey.',
};

export function sortOrgs(orgs: readonly OrganisationSummary[]): OrgLink[] {
  return [...orgs]
    .sort((a, b) => a.org_name.localeCompare(b.org_name, undefined, { sensitivity: 'base' }))
    .map((o) => ({ name: o.org_name }));
}
