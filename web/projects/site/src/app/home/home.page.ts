import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { AccountMenu, GoBox, GoogleButton, HorseFace, Loader, OrgList, Page, ThemePicker, YouCard, pollResource } from '@token-derby/ui';
import { Session } from '../session/session';
import { AUTH_ERROR_TEXT, HomeApi, sortOrgs } from './home-api';
import { hostScale } from './home-scale';

const RACE_CODE = /^[A-Za-z0-9]{6}$/;

/** The front door: sign in to see your orgs, or find an org or race by name. */
@Component({
  selector: 'site-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Page, ThemePicker, HorseFace, Loader, AccountMenu, GoogleButton, GoBox, OrgList, YouCard, RouterLink, NgTemplateOutlet],
  providers: [HomeApi],
  host: { 'data-page': 'home', '[style.--home-scale]': 'scale()' },
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly api = inject(HomeApi);
  private readonly router = inject(Router);
  protected readonly session = inject(Session);

  readonly authError = input<string | undefined>(undefined, { alias: 'auth_error' });

  protected readonly orgPattern = ORG_NAME_PATTERN;
  protected readonly racePattern = RACE_CODE;
  protected readonly signInHref = '/api/auth/google/start?return_to=%2F';
  protected readonly name = computed(() => this.session.user()?.display_name ?? 'Account');

  // Latches the message so tidying the URL doesn't take it away.
  protected readonly errorText = linkedSignal<string | undefined, string | null>({
    source: this.authError,
    computation: (code, prev) =>
      code ? (AUTH_ERROR_TEXT[code] ?? AUTH_ERROR_TEXT['sso_failed']!)
        : (prev?.value ?? (this.session.exchangeFailed() ? AUTH_ERROR_TEXT['sso_failed']! : null)),
  });

  protected readonly orgs = pollResource({
    params: () => (this.session.signedIn() ? true : null),
    loader: () => this.api.myOrgs(),
    intervalMs: 3_600_000,
    until: () => true,
  });
  protected readonly orgLinks = computed(() => sortOrgs(this.orgs.value()?.organisations ?? []));
  protected readonly orgsLoaded = computed(() => this.orgs.value() !== undefined);
  protected readonly findOpen = signal(false);
  protected readonly showFind = computed(() => this.findOpen() || (this.orgsLoaded() && this.orgLinks().length === 0));

  // Grows the column with the window.
  protected readonly scale = hostScale();

  constructor() {
    effect(() => {
      if (this.authError()) void this.router.navigate([], { queryParams: { auth_error: null }, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  protected goOrg(name: string): void {
    void this.router.navigate(['/org', name]);
  }

  protected goRace(code: string): void {
    void this.router.navigate(['/race', code]);
  }

  protected signOut(): void {
    void this.session.signOut();
  }
}
