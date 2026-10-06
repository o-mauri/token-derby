import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AdminUser, CollectedHat, StableHorse } from '@token-derby/shared';
import { HORSE_NAME_MAX_LENGTH, USER_NAME_MAX_LENGTH, hatById } from '@token-derby/shared';
import { ApiError, Button, Confirm, Horse, Loader, NotFound, TextInput, compactTokens } from '@token-derby/ui';
import { AdminApi } from '../api/admin-api';
import { AdminData } from '../data/admin-data';
import { AdminCrumb } from '../shell/admin-crumb';

type Editing = { kind: 'user' } | { kind: 'horse'; hid: string };
type Pending = { kind: 'hat'; hid: string; index: number; message: string } | { kind: 'horse'; hid: string; message: string };
export type HatRow = { index: number; name: string; rarity: string; when: string; equipped: boolean };

/** A horse's hats, newest first, each keeping its stored position for removal. */
export function hatRows(h: StableHorse): HatRow[] {
  return (h.hats ?? []).map((c: CollectedHat, index) => {
    const def = hatById(c.id);
    return { index, name: def?.name ?? c.id, rarity: def?.rarity ?? 'common', when: c.obtained_at?.slice(0, 10) ?? '', equipped: h.equipped_hat === index };
  }).sort((a, b) => b.when.localeCompare(a.when));
}

export function avgFinish(h: StableHorse): string {
  return h.races_entered && h.total_finishing_position ? (h.total_finishing_position / h.races_entered).toFixed(1) : '—';
}

const message = (e: unknown) => (e instanceof ApiError && e.code !== 'NETWORK_ERROR' ? e.message : "Couldn't save that. Try again.");

/** One user: rename them and their horses, and remove hats or horses after confirming. */
@Component({
  selector: 'admin-user-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Confirm, Horse, Loader, NotFound, TextInput],
  host: { 'data-page': 'user' },
  templateUrl: './user.page.html',
  styleUrl: './user.page.scss',
})
export class UserPage {
  private readonly api = inject(AdminApi);
  protected readonly data = inject(AdminData);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly user = this.data.userById(() => this.id());
  protected readonly editing = signal<Editing | null>(null);
  protected readonly draft = signal<string | number | null>('');
  protected readonly pending = signal<Pending | null>(null);
  protected readonly busy = signal(false);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly openHats = signal<ReadonlySet<string>>(new Set());

  protected readonly userMax = USER_NAME_MAX_LENGTH;
  protected readonly horseMax = HORSE_NAME_MAX_LENGTH;
  protected readonly hatRows = hatRows;
  protected readonly avgFinish = avgFinish;
  protected readonly tokens = (h: StableHorse) => compactTokens(h.total_tokens ?? 0);
  protected readonly notFoundMessage = computed(() => ['No user with id ', { strong: this.id() }, '.']);
  protected readonly clean = computed(() => String(this.draft() ?? '').trim());

  constructor() {
    this.data.ensureUsers();
    const crumb = inject(AdminCrumb);
    effect(() => crumb.extra.set(this.user()?.display_name ?? null));
    inject(DestroyRef).onDestroy(() => crumb.extra.set(null));
  }

  protected worn(h: StableHorse) {
    const c = typeof h.equipped_hat === 'number' ? h.hats?.[h.equipped_hat] : undefined;
    return c ? { id: c.id, variant: c.variant ?? 0 } : null;
  }

  protected isEditing(kind: 'user' | 'horse', hid?: string): boolean {
    const e = this.editing();
    return !!e && e.kind === kind && (kind === 'user' || (e.kind === 'horse' && e.hid === hid));
  }

  protected canSave(current: string, max: number): boolean {
    const n = this.clean();
    return !this.busy() && n.length >= 1 && n.length <= max && n !== current;
  }

  protected edit(kind: 'user' | 'horse', current: string, hid?: string): void {
    this.editing.set(kind === 'user' ? { kind } : { kind, hid: hid! });
    this.draft.set(current);
    this.setError(kind === 'user' ? 'user' : `horse:${hid}`, null);
  }

  protected async saveUser(u: AdminUser): Promise<void> {
    if (!this.canSave(u.display_name, this.userMax)) return;
    await this.run('user', async () => {
      const res = await this.api.renameUser(u.user_id, this.clean());
      this.data.patchUser(u.user_id, (x) => ({ ...x, display_name: res.display_name }));
      this.editing.set(null);
    });
  }

  protected async saveHorse(u: AdminUser, h: StableHorse): Promise<void> {
    if (!this.canSave(h.name, this.horseMax)) return;
    await this.run(`horse:${h.stable_horse_id}`, async () => {
      const updated = await this.api.renameHorse(u.user_id, h.stable_horse_id, this.clean());
      this.replaceHorse(u.user_id, updated);
      this.editing.set(null);
    });
  }

  protected toggleHats(hid: string): void {
    this.openHats.update((s) => { const n = new Set(s); if (n.has(hid)) n.delete(hid); else n.add(hid); return n; });
  }

  protected askRemoveHat(h: StableHorse, row: HatRow): void {
    this.pending.set({ kind: 'hat', hid: h.stable_horse_id, index: row.index, message: `Remove ${row.name} from ${h.name}?` });
  }

  protected askDeleteHorse(h: StableHorse): void {
    this.pending.set({ kind: 'horse', hid: h.stable_horse_id, message: `Delete ${h.name}?` });
  }

  protected async confirm(): Promise<void> {
    const p = this.pending();
    const u = this.user();
    if (!p || !u || this.busy()) return;
    this.pending.set(null);
    await this.run(`horse:${p.hid}`, async () => {
      if (p.kind === 'hat') {
        this.replaceHorse(u.user_id, await this.api.removeHat(u.user_id, p.hid, p.index));
      } else {
        await this.api.deleteHorse(u.user_id, p.hid);
        this.data.patchUser(u.user_id, (x) => ({ ...x, horses: x.horses.filter((h) => h.stable_horse_id !== p.hid) }));
      }
    });
  }

  protected back(): void {
    void this.router.navigate(['/users']);
  }

  private replaceHorse(uid: string, updated: StableHorse): void {
    this.data.patchUser(uid, (x) => ({ ...x, horses: x.horses.map((h) => (h.stable_horse_id === updated.stable_horse_id ? updated : h)) }));
  }

  private async run(key: string, work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.setError(key, null);
    try {
      await work();
    } catch (e) {
      this.setError(key, message(e));
    } finally {
      this.busy.set(false);
    }
  }

  private setError(key: string, text: string | null): void {
    this.errors.update((all) => {
      const next = { ...all };
      if (text === null) delete next[key]; else next[key] = text;
      return next;
    });
  }
}
