import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ControlBase } from '../control-base';

@Component({
  selector: 'td-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) { <label class="label" [for]="id">{{ label() }}</label> }
    <textarea #box class="box" [id]="id" [rows]="rows()" [value]="value()" [disabled]="disabled()"
      [required]="required()" [attr.aria-invalid]="visibleErrors().length > 0"
      (input)="value.set(box.value)" (blur)="touch.emit()"></textarea>
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './textarea.scss',
})
export class Textarea extends ControlBase {
  readonly value = model('');
  readonly rows = input(4);
}
