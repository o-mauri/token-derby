import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

/** A dashboard panel: a big vertical spine title beside its content. A real link when given one, so it can
 *  open in a new tab; greyed and inert when disabled. */
@Component({
  selector: 'td-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet],
  host: { '[class.disabled]': 'disabled()', '[class.linked]': '!!link() && !disabled()', '[class.compact]': 'compact()' },
  template: `
    @if (link() && !disabled()) {
      <a class="frame" [routerLink]="link()"><ng-container [ngTemplateOutlet]="inner" /></a>
    } @else {
      <div class="frame" [attr.aria-disabled]="disabled() || null"><ng-container [ngTemplateOutlet]="inner" /></div>
    }
    <ng-template #inner>
      <span class="spine">{{ spine() }}</span>
      <div class="body"><ng-content /></div>
    </ng-template>
  `,
  styleUrl: './panel.scss',
})
export class Panel {
  readonly spine = input.required<string>();
  readonly link = input<readonly unknown[] | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  /** A smaller spine, so a long label fits a short panel. */
  readonly compact = input(false, { transform: booleanAttribute });
}
