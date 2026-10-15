import { SiteVersionSwitch } from '../version/version-switch';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { GetJockeyResponse, StableHorse } from '@token-derby/shared';
import { Button, Crumbs, GoogleButton, Horse, Loader, Panel, ThemePicker, compactTokens } from '@token-derby/ui';
import { Session } from '../session/session';
import { PaddockApi } from './paddock-api';
import { avgFinish, hatCollection, sortStable, totals, wornHat } from './paddock-model';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; jockey: GetJockeyResponse; horses: StableHorse[] };

/** Your paddock: your career totals and your stable, with Trophies and Achievements to come. */
@Component({
  selector: 'site-paddock-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteVersionSwitch, RouterLink, Button, Crumbs, GoogleButton, Horse, Loader, Panel, ThemePicker],
  host: { 'data-page': 'paddock' },
  templateUrl: './paddock.page.html',
  styleUrl: './paddock.page.scss',
})
export class PaddockPage {
  protected readonly session = inject(Session);
  private readonly api = inject(PaddockApi);
  private readonly router = inject(Router);

  protected readonly load = signal<Load>({ status: 'loading' });
  protected readonly open = signal<ReadonlySet<string>>(new Set());
  private generation = 0;

  protected readonly name = computed(() => this.session.user()?.display_name ?? 'You');
  protected readonly signInHref = computed(() => `/api/auth/google/start?return_to=${encodeURIComponent(this.router.url)}`);
  protected readonly ready = computed(() => { const l = this.load(); return l.status === 'ready' ? l : null; });
  protected readonly horses = computed(() => sortStable(this.ready()?.horses ?? []));
  protected readonly totals = computed(() => {
    const t = totals(this.ready()?.horses ?? []);
    return [['Horses', String(t.horses)], ['Races', String(t.races)], ['Wins', String(t.wins)],
      ['Podiums', String(t.podiums)], ['Tokens', compactTokens(t.tokens)], ['XP', compactTokens(t.xp)]] as const;
  });
  protected readonly joined = computed(() => {
    const at = this.ready()?.jockey.created_at;
    return at ? `joined ${new Date(at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : '';
  });

  protected readonly worn = wornHat;
  protected readonly avg = avgFinish;
  protected readonly hats = hatCollection;

  constructor() {
    if (this.session.signedIn()) this.reload();
  }

  protected reload(): void {
    const gen = ++this.generation;
    this.load.set({ status: 'loading' });
    Promise.all([this.api.jockey(), this.api.stable()]).then(
      ([jockey, stable]) => { if (gen === this.generation) this.load.set({ status: 'ready', jockey, horses: stable.horses }); },
      () => { if (gen === this.generation) this.load.set({ status: 'error' }); },
    );
  }

  protected toggle(id: string): void {
    this.open.update((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
}
