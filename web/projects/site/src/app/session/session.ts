import { EnvironmentProviders, Injectable, computed, inject, makeEnvironmentProviders, provideAppInitializer, signal } from '@angular/core';
import { Location } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { WebSessionExchangeResponse } from '@token-derby/shared';
import { SESSION_KEYS, SESSION_STORAGE } from './session-storage';
import { WITH_SESSION } from './session.interceptor';

export type SessionUser = { readonly user_id: string; readonly display_name: string | null; readonly email?: string };
type State = { readonly token: string; readonly user: SessionUser };

/** The signed-in web session: held in storage, set from the sign-in code, cleared on sign-out or a 401. */
@Injectable()
export class Session {
  private readonly storage = inject(SESSION_STORAGE);
  private readonly http = inject(HttpClient);
  private readonly location = inject(Location);
  private readonly state = signal<State | null>(this.load());

  readonly token = computed(() => this.state()?.token ?? null);
  readonly user = computed(() => this.state()?.user ?? null);
  readonly signedIn = computed(() => this.state() !== null);

  adopt(res: WebSessionExchangeResponse): void {
    const { user } = res;
    this.write(SESSION_KEYS.token, res.token);
    this.write(SESSION_KEYS.uid, user.user_id);
    this.write(SESSION_KEYS.email, user.email ?? null);
    this.write(SESSION_KEYS.expires, res.expires_at);
    this.write(SESSION_KEYS.name, user.display_name);
    this.state.set({ token: res.token, user: { user_id: user.user_id, display_name: user.display_name, ...(user.email ? { email: user.email } : {}) } });
  }

  clear(): void {
    for (const key of Object.values(SESSION_KEYS)) this.write(key, null);
    this.state.set(null);
  }

  /** Swaps a `#code=` from the sign-in redirect for a session. The fragment is cleared first so the code never lingers. */
  async exchangeFromUrl(): Promise<'none' | 'ok' | 'failed'> {
    const full = this.location.path(true);
    const hashAt = full.indexOf('#');
    if (hashAt < 0) return 'none';
    const code = new URLSearchParams(full.slice(hashAt + 1)).get('code');
    if (!code) return 'none';
    this.location.replaceState(full.slice(0, hashAt));
    try {
      this.adopt(await firstValueFrom(this.http.post<WebSessionExchangeResponse>('/api/web-sessions/exchange', { code })));
      return 'ok';
    } catch {
      return 'failed';
    }
  }

  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.delete('/api/web-sessions', { context: new HttpContext().set(WITH_SESSION, true) }));
    } catch {
      // Signing out locally is what matters; the server session expires on its own.
    } finally {
      this.clear();
    }
  }

  private load(): State | null {
    const token = this.read(SESSION_KEYS.token);
    if (!token) return null;
    const expires = Date.parse(this.read(SESSION_KEYS.expires) ?? '');
    if (expires <= Date.now()) {
      for (const key of Object.values(SESSION_KEYS)) this.write(key, null);
      return null;
    }
    const email = this.read(SESSION_KEYS.email);
    return {
      token,
      user: { user_id: this.read(SESSION_KEYS.uid) ?? '', display_name: this.read(SESSION_KEYS.name), ...(email ? { email } : {}) },
    };
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      // Storage can be full or blocked; the in-memory session still works for this visit.
    }
  }
}

/** The app's session, with the sign-in code exchanged before the first page renders. */
export function provideSession(): EnvironmentProviders {
  return makeEnvironmentProviders([Session, provideAppInitializer(() => inject(Session).exchangeFromUrl())]);
}
