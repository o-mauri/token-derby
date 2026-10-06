import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, output, viewChild } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';

let nextId = 0;

/** An in-page confirm over its positioned parent: no browser pop-up. Focus stays inside, and Escape cancels. */
@Component({
  selector: 'td-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkTrapFocus],
  template: `
    @if (open()) {
      <div class="backdrop">
        <div class="box" [class.danger]="tone() === 'danger'" role="alertdialog" aria-modal="true" [attr.aria-labelledby]="id"
          cdkTrapFocus (keydown.escape)="cancel.emit()">
          <p class="message" [id]="id">{{ message() }}</p>
          @if (detail()) { <p class="detail">{{ detail() }}</p> }
          <div class="actions">
            <button #confirmButton type="button" class="confirm" (click)="confirm.emit()">{{ confirmLabel() }}</button>
            <button type="button" class="cancel" (click)="cancel.emit()">Cancel</button>
          </div>
        </div>
      </div>
    }
  `,
  styleUrl: './confirm.scss',
})
export class Confirm {
  readonly open = input(false);
  readonly message = input.required<string>();
  readonly detail = input('');
  readonly confirmLabel = input('Confirm');
  readonly tone = input<'danger' | 'normal'>('danger');
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  protected readonly id = `td-confirm-${++nextId}`;
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    // Opening moves focus into the box, so the keyboard lands on the choice.
    afterRenderEffect(() => this.confirmButton()?.nativeElement.focus());
  }
}
