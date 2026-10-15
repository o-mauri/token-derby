import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import { ApiError, Button, Confirm } from '@token-derby/ui';
import { REDIRECT } from '../session/redirect';
import { Session } from '../session/session';
import { AccountApi } from './account-api';

/** Your display name, linked Google email, and signing out here or in every browser. */
@Component({
  selector: 'site-profile-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Confirm],
  host: { 'data-tab': 'profile' },
  templateUrl: './profile.tab.html',
  styleUrl: './profile.tab.scss',
})
export class ProfileTab {
  protected readonly session = inject(Session);
  private readonly api = inject(AccountApi);
  private readonly router = inject(Router);
  private readonly redirect = inject(REDIRECT);

  protected readonly max = USER_NAME_MAX_LENGTH;
  private readonly current = computed(() => this.session.user()?.display_name ?? '');
  protected readonly draft = linkedSignal(() => this.current());
  protected readonly clean = computed(() => this.draft().trim());
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canSave = computed(() =>
    this.clean().length >= 1 && this.clean().length <= this.max && this.clean() !== this.current() && !this.saving());
  protected readonly linking = signal(false);
  protected readonly confirmAll = signal(false);
  protected readonly signingOutAll = signal(false);
  protected readonly signOutError = signal<string | null>(null);

  protected edit(value: string): void {
    this.draft.set(value);
    this.saved.set(false);
    this.error.set(null);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      await this.session.rename(this.clean());
      this.saved.set(true);
    } catch (e) {
      this.error.set(e instanceof ApiError && e.code !== 'NETWORK_ERROR' ? e.message : "Couldn't save your name. Try again.");
    } finally {
      this.saving.set(false);
    }
  }

  protected async link(): Promise<void> {
    this.linking.set(true);
    try {
      this.redirect((await this.api.linkStart()).authorize_url);
    } catch {
      this.error.set("Couldn't start linking Google. Try again.");
      this.linking.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/']);
  }

  protected async signOutAll(): Promise<void> {
    this.confirmAll.set(false);
    this.signingOutAll.set(true);
    this.signOutError.set(null);
    try {
      await this.session.signOutEverywhere();
      await this.router.navigate(['/']);
    } catch {
      this.signOutError.set("Couldn't sign out everywhere. Try again.");
      this.signingOutAll.set(false);
    }
  }
}
