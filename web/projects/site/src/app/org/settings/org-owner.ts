import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { GetOrganisationResponse } from '@token-derby/shared';
import { ApiError } from '@token-derby/ui';
import { Session } from '../../session/session';
import { OrgData } from '../org-data';
import { OrgSettingsApi } from './org-settings-api';

export type OwnerStatus = 'idle' | 'loading' | 'owner' | 'not-owner' | 'not-found' | 'error';

/** Whether the signed-in user owns this org, from its member-only record. Signed out, it asks nothing. */
@Injectable()
export class OrgOwner {
  private readonly api = inject(OrgSettingsApi);
  private readonly session = inject(Session);
  private readonly name = inject(OrgData).name;
  private generation = 0;

  readonly org = signal<GetOrganisationResponse | null>(null);
  readonly status = signal<OwnerStatus>('idle');
  readonly isOwner = computed(() => this.status() === 'owner');

  constructor() {
    effect(() => {
      const name = this.name();
      const signedIn = this.session.signedIn();
      untracked(() => (name && signedIn ? void this.load(name) : this.reset()));
    });
  }

  /** Re-reads the record, after the token rotates or another owner session changes access. */
  reload(): void {
    const name = this.name();
    if (name && this.session.signedIn()) void this.load(name);
  }

  /** Keeps the shared record in step after a tab saves, so every tab (and a later visit) sees the change. */
  patch(change: Partial<GetOrganisationResponse>): void {
    this.org.update((o) => (o ? { ...o, ...change } : o));
  }

  private reset(): void {
    this.generation++;
    this.org.set(null);
    this.status.set('idle');
  }

  private async load(name: string): Promise<void> {
    const run = ++this.generation;
    if (!this.org()) this.status.set('loading');
    try {
      const org = await this.api.org(name);
      if (run !== this.generation) return;
      this.org.set(org);
      this.status.set(org.creator_user_id === this.session.user()?.user_id ? 'owner' : 'not-owner');
    } catch (e) {
      if (run !== this.generation) return;
      // A failed refresh keeps the page we already have rather than swapping it for an error.
      if (this.org()) return;
      const code = e instanceof ApiError ? e.code : '';
      this.status.set(code === 'NOT_ORG_MEMBER' ? 'not-owner' : code === 'ORG_NOT_FOUND' ? 'not-found' : 'error');
    }
  }
}
