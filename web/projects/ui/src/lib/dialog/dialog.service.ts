import { Injectable, TemplateRef, inject } from '@angular/core';
import { Dialog, type DialogRef } from '@angular/cdk/dialog';

/** Opens dialogs with the house defaults: modal for assistive tech, labelled, on a dark backdrop. */
@Injectable({ providedIn: 'root' })
export class TdDialogService {
  private readonly dialog = inject(Dialog);

  open<R = unknown>(content: TemplateRef<unknown>, opts: { label: string }): DialogRef<R> {
    return this.dialog.open<R>(content, {
      ariaModal: true,
      ariaLabel: opts.label,
      backdropClass: 'cdk-overlay-dark-backdrop',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}
