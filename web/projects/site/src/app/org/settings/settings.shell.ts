import { SiteVersionSwitch } from '../../version/version-switch';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  AccountMenu, Button, Confirm, Crumbs, GoogleButton, Loader, NotFound, ThemePicker, type TabLink, Tabs,
} from '@token-derby/ui';
import { hostScale } from '../../home/home-scale';
import { Session } from '../../session/session';
import { OrgData } from '../org-data';
import { DraftRegistry } from './drafts';
import { OrgOwner } from './org-owner';

// Relative to this shell's route, so the preview's tabs stay inside the preview.
const TABS: TabLink[] = [
  { label: 'Members', link: ['.'] }, { label: 'Access', link: ['access'] }, { label: 'Racing', link: ['racing'] },
  { label: 'Race settings', link: ['race-settings'] }, { label: 'Notifications', link: ['notifications'] },
];

/** /org/:name/settings: the owner's tabs, or why you can't see them. */
@Component({
  selector: 'site-settings-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteVersionSwitch, RouterOutlet, RouterLink, AccountMenu, Button, Confirm, Crumbs, GoogleButton, Loader, NotFound, ThemePicker, Tabs],
  host: { 'data-page': 'org-settings', '[style.--home-scale]': 'scale()' },
  templateUrl: './settings.shell.html',
  styleUrl: './settings.shell.scss',
})
export class SettingsShell {
  protected readonly session = inject(Session);
  protected readonly owner = inject(OrgOwner);
  protected readonly drafts = inject(DraftRegistry);
  private readonly data = inject(OrgData);
  private readonly router = inject(Router);

  protected readonly tabs = TABS;
  protected readonly scale = hostScale();
  // The org's own casing once its record arrives; blank until then so the name doesn't jump.
  protected readonly orgName = computed(() => this.owner.org()?.org_name ?? '');
  protected readonly typedName = computed(() => this.data.name() ?? '');
  protected readonly name = computed(() => this.session.user()?.display_name ?? 'Account');
  protected readonly signInHref = computed(() => `/api/auth/google/start?return_to=${encodeURIComponent(this.router.url)}`);
  protected readonly notFoundMessage = computed(() => ['No organisation named ', { strong: this.typedName() }, '.']);

  protected home(): void {
    void this.router.navigate(['/']);
  }

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigate(['/']);
  }
}
