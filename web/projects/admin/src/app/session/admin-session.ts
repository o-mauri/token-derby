import { DOCUMENT, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type { AdminLoginResponse } from '@token-derby/shared';

/** Where the admin sign-in is kept: localStorage, or null when the browser refuses it. */
export const ADMIN_STORAGE = new InjectionToken<Storage | null>('ADMIN_STORAGE', {
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

// `token` is the old admin's key, so a sign-in there carries over.
export const ADMIN_KEYS = { token: 'td_admin_token', expires: 'td_admin_expires' } as const;

/** Only in-app paths are followed after sign-in; anything else lands on Users. */
export function safeReturnTo(raw: string | null | undefined): string {
  return raw && /^\/(?!\/)/.test(raw) && !raw.includes('\\') ? raw : '/users';
}

/** The signed-in admin's bearer token. */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  private readonly storage = inject(ADMIN_STORAGE);
  private readonly state = signal<string | null>(this.load());

  readonly token = this.state.asReadonly();
  readonly signedIn = computed(() => this.state() !== null);

  set(res: AdminLoginResponse): void {
    this.write(ADMIN_KEYS.token, res.token);
    this.write(ADMIN_KEYS.expires, res.expires_at);
    this.state.set(res.token);
  }

  clear(): void {
    this.write(ADMIN_KEYS.token, null);
    this.write(ADMIN_KEYS.expires, null);
    this.state.set(null);
  }

  private load(): string | null {
    const token = this.read(ADMIN_KEYS.token);
    if (!token) return null;
    const expires = this.read(ADMIN_KEYS.expires);
    // An old-admin token has no expiry; it stays until the API refuses it.
    if (expires !== null && Date.parse(expires) <= Date.now()) {
      this.write(ADMIN_KEYS.token, null);
      this.write(ADMIN_KEYS.expires, null);
      return null;
    }
    return token;
  }

  private read(key: string): string | null {
    try { return this.storage?.getItem(key) ?? null; } catch { return null; }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch { /* storage refused: the session lasts for this page only */ }
  }
}
