import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CliAuthApproveRequest, CliAuthApproveResponse } from '@token-derby/shared';
import { WITH_SESSION } from '../session/session.interceptor';

/** Looks up and approves a CLI login code for the signed-in user. */
@Injectable()
export class CliApi {
  private readonly http = inject(HttpClient);

  approve(user_code: string, preview: boolean): Promise<CliAuthApproveResponse> {
    const body: CliAuthApproveRequest = preview ? { user_code, preview: true } : { user_code };
    return firstValueFrom(this.http.post<CliAuthApproveResponse>('/api/auth/cli/approve', body, { context: new HttpContext().set(WITH_SESSION, true) }));
  }
}

export const CLI_ERROR_TEXT: Record<string, string> = {
  CLI_AUTH_NOT_FOUND: "That code didn't match. Check your terminal and try again.",
  CLI_AUTH_WRONG_ACCOUNT: 'That code belongs to another account.',
  RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
};
export const CLI_ERROR_FALLBACK = "Couldn't approve that code. Try again.";
