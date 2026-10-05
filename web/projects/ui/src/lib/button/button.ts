import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Styles a native button, or an anchor carrying Angular's routerLink. */
@Component({
  selector: 'button[td-button], a[td-button]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'td-button', '[class.sm]': "size() === 'sm'" },
  template: `<span class="label"><ng-content /></span>`,
  styleUrl: './button.scss',
})
export class Button {
  readonly size = input<'md' | 'sm'>('md');
}
