import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AccountMenu, Button, GoogleButton, HorseFace, ThemePicker, type TabLink, Tabs } from '@token-derby/ui';
import { hostScale } from '../home/home-scale';
import { Session } from '../session/session';
import { AccountApi } from './account-api';

// Relative to this shell's route, so the preview's tabs stay inside the preview.
const TABS: TabLink[] = [{ label: 'Profile', link: ['.'] }, { label: 'Devices', link: ['devices'] }];

/** The account page frame: header and tabs around the Profile and Devices tabs, or a sign-in prompt. */
@Component({
  selector: 'site-account-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, AccountMenu, Button, GoogleButton, HorseFace, ThemePicker, Tabs],
  providers: [AccountApi],
  host: { 'data-page': 'account', '[style.--home-scale]': 'scale()' },
  templateUrl: './account.shell.html',
  styleUrl: './account.shell.scss',
})
export class AccountShell {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;
  // Grows the tab content with the window, like the home page.
  protected readonly scale = hostScale();
  protected readonly name = computed(() => this.session.user()?.display_name ?? 'Account');
  protected readonly signInHref = computed(() => `/api/auth/google/start?return_to=${encodeURIComponent(this.router.url)}`);

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/']);
  }
}
