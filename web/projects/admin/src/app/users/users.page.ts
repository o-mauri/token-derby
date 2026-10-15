import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminUser } from '@token-derby/shared';
import { Button, Loader, TextInput } from '@token-derby/ui';
import { AdminData } from '../data/admin-data';

export type UserRow = { id: string; name: string; email: string; horses: number; races: number; wins: number; podiums: number; xp: number; joined: string };

const sum = (u: AdminUser, f: (h: AdminUser['horses'][number]) => number | undefined) => u.horses.reduce((n, h) => n + (f(h) ?? 0), 0);

export function userRow(u: AdminUser): UserRow {
  return {
    id: u.user_id, name: u.display_name, email: u.email ?? '', horses: u.horses.length,
    races: sum(u, (h) => h.races_entered), wins: sum(u, (h) => h.wins), podiums: sum(u, (h) => h.podiums), xp: sum(u, (h) => h.xp),
    joined: u.created_at.slice(0, 10),
  };
}

/** Every registered user, filterable by name or email; each row opens that user. */
@Component({
  selector: 'admin-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Loader, TextInput],
  host: { 'data-page': 'users' },
  templateUrl: './users.page.html',
  styleUrl: './list-page.scss',
})
export class UsersPage {
  protected readonly data = inject(AdminData);
  protected readonly filter = signal<string | number | null>('');
  protected readonly needle = computed(() => String(this.filter() ?? '').trim().toLowerCase());

  protected readonly rows = computed(() => {
    const all = (this.data.users.value()?.users ?? []).map(userRow)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const n = this.needle();
    return n ? all.filter((r) => r.name.toLowerCase().includes(n) || r.email.toLowerCase().includes(n)) : all;
  });

  constructor() {
    this.data.ensureUsers();
  }
}
