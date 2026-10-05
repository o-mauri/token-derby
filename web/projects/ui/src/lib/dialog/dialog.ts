import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

let nextId = 0;

/** A modal panel's frame: title, a close button and the content. Open it with the CDK `Dialog`,
 *  which supplies the focus trap, Escape, backdrop click and aria-modal. */
@Component({
  selector: 'td-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="top">
      <h2 class="heading" [id]="titleId">{{ title() }}</h2>
      <button type="button" class="close" [attr.aria-label]="'Close ' + title()" (click)="close()">✕</button>
    </header>
    <div class="body"><ng-content /></div>
  `,
  styleUrl: './dialog.scss',
})
export class DialogFrame {
  readonly title = input.required<string>();
  // For frames shown outside a CDK dialog.
  readonly closed = output<void>();

  protected readonly titleId = `td-dialog-title-${++nextId}`;
  private readonly ref = inject(DialogRef, { optional: true });

  protected close(): void {
    this.ref?.close();
    this.closed.emit();
  }
}
