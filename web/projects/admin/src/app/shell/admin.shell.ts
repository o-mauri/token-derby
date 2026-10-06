import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Button, Crumbs, type TabLink, Tabs, ThemePicker } from '@token-derby/ui';
import { AdminData } from '../data/admin-data';
import { AdminSession } from '../session/admin-session';
import { AdminCrumb } from './admin-crumb';

const count = (label: string, n: number | undefined) => (n === undefined ? label : `${label} · ${n}`);

/** The signed-in frame: breadcrumb, tabs with counts, theme and sign out around each admin page. */
@Component({
  selector: 'admin-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Button, Crumbs, Tabs, ThemePicker],
  host: { 'data-page': 'admin' },
  templateUrl: './admin.shell.html',
  styleUrl: './admin.shell.scss',
})
export class AdminShell {
  private readonly data = inject(AdminData);
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly crumb = inject(AdminCrumb);

  // The deepest active route's `section` data names the tab the page belongs to.
  private readonly section = toSignal(this.router.events.pipe(
    filter((e) => e instanceof NavigationEnd), startWith(null), map(() => {
      let r = this.route.snapshot;
      while (r.firstChild) r = r.firstChild;
      return (r.data['section'] as string | undefined) ?? null;
    }),
  ), { initialValue: null });

  protected readonly crumbs = computed(() => [
    { label: 'Admin', link: ['/users'] },
    ...(this.section() ? [{ label: this.section()!, link: this.crumb.extra() ? [`/${this.section()!.toLowerCase()}`] : null }] : []),
    ...(this.crumb.extra() ? [{ label: this.crumb.extra()! }] : []),
  ]);

  protected readonly tabs = computed<TabLink[]>(() => [
    { label: count('Users', this.data.users.value()?.users.length), link: ['/users'] },
    { label: count('Organisations', this.data.orgs.value()?.organisations.length), link: ['/organisations'] },
    { label: 'Claims', link: ['/claims'] },
  ]);

  constructor() {
    this.data.ensureUsers();
    this.data.ensureOrgs();
  }

  protected async signOut(): Promise<void> {
    this.session.clear();
    await this.router.navigateByUrl('/login');
  }
}
