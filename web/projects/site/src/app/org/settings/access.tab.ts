import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import type { OrgAccessSettings } from '@token-derby/shared';
import { ApiError, Button, Confirm, CopyField, DomainList, Toggle } from '@token-derby/ui';
import { OrgData } from '../org-data';
import { DraftRegistry } from './drafts';
import { OrgOwner } from './org-owner';
import { OrgSettingsApi } from './org-settings-api';
import { settingsErrorText } from './settings-errors';

type Switch = 'join_token_enabled' | 'domain_join_enabled' | 'restrict_to_allowed_domains';

/** Who can join: the join token, domain auto-join and the allowed domains. Switches save straight away; domains on Save. */
@Component({
  selector: 'site-access-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Confirm, CopyField, DomainList, Toggle],
  host: { 'data-tab': 'access' },
  templateUrl: './access.tab.html',
  styleUrl: './settings-tab.scss',
})
export class AccessTab {
  private readonly api = inject(OrgSettingsApi);
  private readonly owner = inject(OrgOwner);
  private readonly drafts = inject(DraftRegistry);
  private readonly name = inject(OrgData).name;

  // What the server last said; the switches show `shown`, which moves first and snaps back on failure.
  private readonly server = linkedSignal<OrgAccessSettings | null>(() => this.owner.org()?.access ?? null);
  protected readonly shown = linkedSignal(() => this.server());
  protected readonly domains = linkedSignal<readonly string[]>(() => this.server()?.allowed_domains ?? []);
  protected readonly token = linkedSignal(() => this.owner.org()?.org_join_token ?? '');
  protected readonly rotated = signal(false);
  protected readonly confirmRotate = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly domainsDirty = computed(() => (this.server()?.allowed_domains ?? []).join() !== this.domains().join());

  constructor() {
    effect(() => this.drafts.set('Access', this.domainsDirty()));
    inject(DestroyRef).onDestroy(() => this.drafts.set('Access', false));
  }

  protected async flip(key: Switch, on: boolean): Promise<void> {
    const before = this.server();
    if (!before) return;
    this.shown.set({ ...before, [key]: on });
    await this.save({ ...before, [key]: on });
  }

  protected async saveDomains(): Promise<void> {
    const before = this.server();
    if (before) await this.save({ ...before, allowed_domains: [...this.domains()] });
  }

  protected async rotate(): Promise<void> {
    this.confirmRotate.set(false);
    this.error.set(null);
    try {
      this.token.set((await this.api.rotateToken(this.name()!)).org_join_token);
      this.rotated.set(true);
    } catch (e) {
      this.error.set(settingsErrorText(e, this.orgName()));
    }
  }

  protected orgName(): string {
    return this.owner.org()?.org_name ?? '';
  }

  private async save(next: OrgAccessSettings): Promise<void> {
    this.error.set(null);
    this.saved.set(false);
    try {
      const res = await this.api.setAccess(this.name()!, next);
      this.server.set(res.access);
      this.saved.set(true);
    } catch (e) {
      this.error.set(settingsErrorText(e, this.orgName()));
      // Snap back to what the server has; on a conflict, to what it has now.
      this.shown.set({ ...this.server()! });
      if (e instanceof ApiError && e.code === 'ACCESS_CONFLICT') this.owner.reload();
    }
  }
}
