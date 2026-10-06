import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError, Button, HorseFace } from '@token-derby/ui';
import { AccountApi } from '../account/account-api';
import { hostScale } from '../home/home-scale';
import { REDIRECT } from '../session/redirect';
import { Session } from '../session/session';

/** The hand-off for `token-derby link`: once signed in from the CLI's code, go straight on to Google. */
@Component({
  selector: 'site-link-google-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, HorseFace],
  providers: [AccountApi],
  host: { 'data-page': 'link-google', '[style.--home-scale]': 'scale()' },
  template: `
    <header class="top">
      <span class="crumb"><td-horse-face class="face" /><span>TOKEN DERBY</span><span class="sep">/</span><span class="here">LINK GOOGLE</span></span>
      <a td-button size="sm" routerLink="/">← Home</a>
    </header>
    <main class="column">
      @if (!session.signedIn()) {
        <p>Run <code>token-derby link</code> in your terminal.</p>
      } @else if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      } @else {
        <p>Taking you to Google…</p>
      }
    </main>
  `,
  styleUrl: './centred-page.scss',
})
export class LinkGooglePage {
  private readonly api = inject(AccountApi);
  private readonly redirect = inject(REDIRECT);
  protected readonly session = inject(Session);
  protected readonly error = signal<string | null>(null);
  protected readonly scale = hostScale();
  private started = false;

  constructor() {
    effect(() => {
      if (!this.session.signedIn() || this.started) return;
      this.started = true;
      untracked(() => void this.start());
    });
  }

  private async start(): Promise<void> {
    try {
      this.redirect((await this.api.linkStart()).authorize_url);
    } catch (e) {
      this.error.set(e instanceof ApiError && e.code !== 'NETWORK_ERROR' ? e.message : "Couldn't start linking Google. Try again.");
    }
  }
}
