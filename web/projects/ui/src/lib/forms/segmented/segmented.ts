import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { CdkListbox, CdkOption, type ListboxValueChangeEvent } from '@angular/cdk/listbox';
import { ControlBase } from '../control-base';
import type { TdOption } from '../option';

/** One choice from a few, shown as joined buttons. Keyboard and ARIA come from the CDK listbox. */
@Component({
  selector: 'td-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkListbox, CdkOption],
  template: `
    @if (label()) { <span class="label" [id]="id">{{ label() }}</span> }
    <div #box="cdkListbox" class="segments" cdkListbox cdkListboxOrientation="horizontal"
      [cdkListboxValue]="selected()" [cdkListboxDisabled]="disabled()" [attr.aria-labelledby]="label() ? id : null"
      (cdkListboxValueChange)="pick($event, box)" (focusout)="touch.emit()">
      @for (o of options(); track o.value) {
        <div class="segment" [cdkOption]="o.value"><span class="text">{{ o.label }}</span></div>
      }
    </div>
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './segmented.scss',
})
export class Segmented<T> extends ControlBase {
  readonly value = model<T | null>(null);
  readonly options = input.required<readonly TdOption<T>[]>();

  protected selected(): readonly T[] {
    const v = this.value();
    return v === null ? [] : [v];
  }

  // A segmented control always keeps a choice, so re-clicking the selected one doesn't clear it.
  protected pick(event: ListboxValueChangeEvent<T>, box: CdkListbox<T>): void {
    const [next] = event.value;
    if (next === undefined) {
      box.value = this.selected();
      return;
    }
    this.value.set(next);
  }
}
