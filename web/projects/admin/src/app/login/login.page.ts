import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError, Button, TextInput, ThemePicker } from '@token-derby/ui';
import { AdminApi } from '../api/admin-api';
import { AdminSession, safeReturnTo } from '../session/admin-session';

/** Username and password sign-in for the admin. */
@Component({
  selector: 'admin-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, TextInput, ThemePicker],
  host: { 'data-page': 'login' },
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);

  // Bound from the `?return_to=` query parameter the auth guard sets.
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly returnTo = input<string | undefined>(undefined, { alias: 'return_to' });
  protected readonly username = signal<string | number | null>('');
  protected readonly password = signal<string | number | null>('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canSubmit = computed(() => !this.busy() && !!String(this.username() ?? '').trim() && !!this.password());

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.session.set(await this.api.login(String(this.username()).trim(), String(this.password())));
      await this.router.navigateByUrl(safeReturnTo(this.returnTo()));
    } catch (e) {
      this.error.set(e instanceof ApiError && e.code === 'NETWORK_ERROR' ? "Couldn't reach the server. Try again." : 'Invalid username or password');
      this.busy.set(false);
    }
  }
}
