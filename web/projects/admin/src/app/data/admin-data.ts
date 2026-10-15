import { Injectable, type Signal, computed, inject, signal } from '@angular/core';
import type { AdminOrgsResponse, AdminUser, AdminUsersResponse } from '@token-derby/shared';
import { AdminApi } from '../api/admin-api';
import { AdminSession } from '../session/admin-session';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A value loaded once on first need (per `key`, such as the signed-in session), reloadable, and patchable after a mutation. */
export class Loadable<T> {
  private readonly state = signal<{ status: LoadStatus; value?: T; error?: unknown }>({ status: 'idle' });
  private key: unknown;
  private generation = 0;
  readonly status = computed(() => this.state().status);
  readonly value = computed(() => this.state().value);
  readonly error = computed(() => this.state().error);

  constructor(private readonly load: () => Promise<T>) {}

  ensure(key?: unknown): void {
    // A new key (a new sign-in) drops what the last one loaded.
    if (key !== this.key) {
      this.key = key;
      this.state.set({ status: 'idle' });
    }
    if (this.state().status === 'idle') this.reload();
  }

  reload(): void {
    const gen = ++this.generation;
    this.state.update((s) => ({ ...s, status: 'loading', error: undefined }));
    // Only the latest request may land, so an older answer can't overwrite a newer one.
    this.load().then(
      (value) => { if (gen === this.generation) this.state.set({ status: 'ready', value }); },
      (error: unknown) => { if (gen === this.generation) this.state.update((s) => ({ ...s, status: 'error', error })); },
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
  private readonly session = inject(AdminSession);
  readonly users = new Loadable<AdminUsersResponse>(() => this.api.users());
  readonly orgs = new Loadable<AdminOrgsResponse>(() => this.api.organisations());

  ensureUsers(): void { this.users.ensure(this.session.token()); }
  ensureOrgs(): void { this.orgs.ensure(this.session.token()); }

  userById(id: () => string): Signal<AdminUser | undefined> {
    return computed(() => this.users.value()?.users.find((u) => u.user_id === id()));
  }

  patchUser(uid: string, f: (u: AdminUser) => AdminUser): void {
    this.users.update((v) => ({ users: v.users.map((u) => (u.user_id === uid ? f(u) : u)) }));
  }
}
