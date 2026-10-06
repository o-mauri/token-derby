import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { ControlBase } from '../control-base';

/** On/off switch: a real button with role="switch", bindable to a boolean form field. */
@Component({
  selector: 'td-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- eslint-disable-next-line @angular-eslint/template/elements-content -- named by the label via aria-labelledby -->
    <button type="button" class="switch" role="switch" [attr.aria-checked]="checked()"
      [attr.aria-labelledby]="label() ? id : null" [disabled]="disabled()"
      (click)="checked.set(!checked())" (blur)="touch.emit()"></button>
    @if (label()) { <span class="label" [id]="id">{{ label() }}</span> }
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './toggle.scss',
})
export class Toggle extends ControlBase {
  readonly checked = model(false);
}
