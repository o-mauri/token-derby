import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { ControlBase } from '../control-base';
import type { TdOption } from '../option';

/** Chips to pick several (race weekdays) or, with `single`, exactly one. Keyboard and ARIA come from the CDK listbox. */
@Component({
  selector: 'td-chip-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkListbox, CdkOption],
  template: `
    @if (label()) { <span class="label" [id]="id">{{ label() }}</span> }
    <div class="chips" cdkListbox [cdkListboxMultiple]="!single()" cdkListboxOrientation="horizontal"
      [cdkListboxValue]="value()" [cdkListboxDisabled]="disabled()" [attr.aria-labelledby]="label() ? id : null"
      (cdkListboxValueChange)="change($event.value)" (focusout)="touch.emit()">
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
  readonly single = input(false, { transform: booleanAttribute });

  // In single mode, clicking the picked chip would leave none picked; keep it picked instead.
  protected change(next: readonly T[]): void {
    this.value.set(this.single() && next.length === 0 ? [...this.value()] : next);
  }
}
