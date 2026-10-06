import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import type { AdminOrgsResponse, AdminUser, AdminUsersResponse } from '@token-derby/shared';
import { AdminApi } from '../api/admin-api';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A value loaded once on first need, reloadable, and patchable after a mutation. */
export class Loadable<T> {
  private readonly state = signal<{ status: LoadStatus; value?: T; error?: unknown }>({ status: 'idle' });
  readonly status = computed(() => this.state().status);
  readonly value = computed(() => this.state().value);
  readonly error = computed(() => this.state().error);

  constructor(private readonly load: () => Promise<T>) {}

  ensure(): void {
    if (this.state().status === 'idle') this.reload();
  }

  reload(): void {
    this.state.update((s) => ({ ...s, status: 'loading', error: undefined }));
    this.load().then(
      (value) => this.state.set({ status: 'ready', value }),
      (error: unknown) => this.state.update((s) => ({ ...s, status: 'error', error })),
    );
  }

  update(f: (v: T) => T): void {
    this.state.update((s) => (s.value === undefined ? s : { ...s, value: f(s.value) }));
  }
}

/** Users and organisations, loaded once per session and shared by the tabs, counts and the user page. */
@Injectable({ providedIn: 'root' })
export class AdminData {
  private readonly api = inject(AdminApi);
  readonly users = new Loadable<AdminUsersResponse>(() => this.api.users());
  readonly orgs = new Loadable<AdminOrgsResponse>(() => this.api.organisations());

  ensureUsers(): void { this.users.ensure(); }
  ensureOrgs(): void { this.orgs.ensure(); }

  userById(id: () => string): Signal<AdminUser | undefined> {
    return computed(() => this.users.value()?.users.find((u) => u.user_id === id()));
  }

  patchUser(uid: string, f: (u: AdminUser) => AdminUser): void {
    this.users.update((v) => ({ users: v.users.map((u) => (u.user_id === uid ? f(u) : u)) }));
  }
}
