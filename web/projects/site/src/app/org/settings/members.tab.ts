import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Confirm, Loader, pollResource } from '@token-derby/ui';
import { OrgData } from '../org-data';
import { OrgOwner } from './org-owner';
import { OrgSettingsApi } from './org-settings-api';
import { settingsErrorText } from './settings-errors';

type Member = { user_id: string; user_name: string; joined_at: string; matches_domain?: 'yes' | 'no' | 'n/a' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MATCH = {
  yes: { mark: '✓', label: 'Email matches domain' },
  no: { mark: '✗', label: "Doesn't match" },
  'n/a': { mark: '–', label: 'No domain set' },
} as const;

/** Who's in the org, and removing someone (never the owner). */
@Component({
  selector: 'site-members-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Confirm, Loader],
  host: { 'data-tab': 'members' },
  templateUrl: './members.tab.html',
  styleUrl: './settings-tab.scss',
})
export class MembersTab {
  private readonly api = inject(OrgSettingsApi);
  private readonly owner = inject(OrgOwner);
  private readonly name = inject(OrgData).name;

  protected readonly list = pollResource({ params: () => this.name(), loader: (n) => this.api.members(n), intervalMs: 3_600_000, until: () => true });
  private readonly removed = signal<ReadonlySet<string>>(new Set());
  protected readonly members = computed(() => (this.list.value()?.members ?? []).filter((m) => !this.removed().has(m.user_id)));
  protected readonly ownerId = computed(() => this.owner.org()?.creator_user_id);
  protected readonly pending = signal<Member | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmText = computed(() => {
    const m = this.pending();
    if (!m) return '';
    const access = this.owner.org()?.access;
    return access?.domain_join_enabled
      ? `Their email still matches ${access.allowed_domains.join(', ')}, so they can rejoin automatically unless you turn off domain join.`
      : "They'll need the join token to come back.";
  });

  protected match(m: Member) {
    return MATCH[m.matches_domain ?? 'n/a'];
  }

  protected joined(iso: string): string {
    const d = new Date(iso);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  protected ask(m: Member): void {
    this.error.set(null);
    this.pending.set(m);
  }

  protected async remove(): Promise<void> {
    const m = this.pending();
    this.pending.set(null);
    if (!m) return;
    try {
      await this.api.removeMember(this.name()!, m.user_id);
      this.removed.update((s) => new Set([...s, m.user_id]));
    } catch (e) {
      this.error.set(settingsErrorText(e, this.owner.org()?.org_name ?? ''));
    }
  }
}
