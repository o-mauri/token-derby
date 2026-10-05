import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { ControlBase } from '../control-base';
import type { TdOption } from '../option';

/** Multi-select chips, e.g. race weekdays. Keyboard and ARIA come from the CDK listbox. */
@Component({
  selector: 'td-chip-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkListbox, CdkOption],
  template: `
    @if (label()) { <span class="label" [id]="id">{{ label() }}</span> }
    <div class="chips" cdkListbox cdkListboxMultiple cdkListboxOrientation="horizontal"
      [cdkListboxValue]="value()" [cdkListboxDisabled]="disabled()" [attr.aria-labelledby]="label() ? id : null"
      (cdkListboxValueChange)="value.set($event.value)" (focusout)="touch.emit()">
      @for (o of options(); track o.value) {
        <div class="chip" [cdkOption]="o.value"><span class="text">{{ o.label }}</span></div>
      }
    </div>
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './chip-group.scss',
})
export class ChipGroup<T> extends ControlBase {
  readonly value = model<readonly T[]>([]);
  readonly options = input.required<readonly TdOption<T>[]>();
}
