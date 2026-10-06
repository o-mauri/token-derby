import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { normaliseUserCode } from '@token-derby/shared';
import { ApiError, Button, CodeInput, GoogleButton, HorseFace } from '@token-derby/ui';
import { hostScale } from '../home/home-scale';
import { Session } from '../session/session';
import { CLI_ERROR_FALLBACK, CLI_ERROR_TEXT, CliApi } from './cli-api';
import { CLI_PREVIEW_START } from './cli-preview';

type Step = 'enter' | 'confirm' | 'done';

/** Approves a CLI login: enter the code from the terminal, check the device name, approve. */
@Component({
  selector: 'site-cli-approve-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, CodeInput, GoogleButton, HorseFace],
  providers: [CliApi],
  host: { 'data-page': 'cli', '[style.--home-scale]': 'scale()' },
  templateUrl: './cli-approve.page.html',
  styleUrl: './centred-page.scss',
})
export class CliApprovePage {
  private readonly api = inject(CliApi);
  protected readonly session = inject(Session);

  private readonly start = inject(CLI_PREVIEW_START);
  protected readonly step = signal<Step>(this.start?.step ?? 'enter');
  protected readonly code = signal('');
  // The code whose label is on screen; Approve sends this one, whatever the boxes say now.
  private readonly lookedUp = signal(this.start?.code ?? '');
  protected readonly label = signal(this.start?.label ?? '');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly scale = hostScale();
  protected readonly signInHref = '/api/auth/google/start?return_to=%2Fcli';
  protected readonly clean = computed(() => normaliseUserCode(this.code()));

  protected async lookUp(event: Event): Promise<void> {
    event.preventDefault();
    const code = this.clean();
    if (!code) return this.error.set('Enter the 6-character code from your terminal.');
    await this.call(code, true);
  }

  protected async approve(): Promise<void> {
    const code = this.lookedUp();
    if (code) await this.call(code, false);
  }

  protected cancel(): void {
    this.error.set(null);
    this.step.set('enter');
  }

  private async call(code: string, preview: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.approve(code, preview);
      this.label.set(res.label);
      if (preview) this.lookedUp.set(code);
      this.step.set(preview ? 'confirm' : 'done');
    } catch (e) {
      this.error.set((e instanceof ApiError && CLI_ERROR_TEXT[e.code]) || CLI_ERROR_FALLBACK);
      this.step.set('enter');
    } finally {
      this.busy.set(false);
    }
  }
}
