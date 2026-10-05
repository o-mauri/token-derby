import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';

type CopyState = 'idle' | 'copied' | 'failed';
const BUTTON_TEXT: Record<CopyState, string> = { idle: 'Copy', copied: 'Copied', failed: 'Copy failed' };
const RESET_MS = 1500;

/** A read-only value, such as a join token, with a copy button. */
@Component({
  selector: 'td-copy-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) { <span class="label">{{ label() }}</span> }
    <div class="row">
      <code class="value">{{ value() }}</code>
      <button type="button" class="copy" [attr.aria-label]="ariaLabel()" (click)="copyValue()"><span class="text">{{ buttonText() }}</span></button>
    </div>
    <span class="sr-only" aria-live="polite">{{ state() === 'idle' ? '' : buttonText() }}</span>
  `,
  styleUrl: './copy-field.scss',
})
export class CopyField {
  readonly value = input.required<string>();
  readonly label = input('');
  readonly copied = output<void>();

  private readonly clipboard = inject(Clipboard);
  protected readonly state = signal<CopyState>('idle');
  protected readonly buttonText = computed(() => BUTTON_TEXT[this.state()]);
  protected readonly ariaLabel = computed(() => (this.label() ? `Copy ${this.label().toLowerCase()}` : 'Copy'));
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected copyValue(): void {
    const ok = this.clipboard.copy(this.value());
    this.state.set(ok ? 'copied' : 'failed');
    if (ok) this.copied.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.state.set('idle'), RESET_MS);
  }
}
