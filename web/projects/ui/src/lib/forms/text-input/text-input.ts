import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ControlBase } from '../control-base';

export type TextInputType = 'text' | 'number' | 'password' | 'time';

@Component({
  selector: 'td-text-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) { <label class="label" [for]="id">{{ label() }}</label> }
    <input #box class="box" [id]="id" [type]="type()" [value]="value() ?? ''" [placeholder]="placeholder()"
      [disabled]="disabled()" [required]="required()" [attr.aria-invalid]="visibleErrors().length > 0"
      (input)="onInput(box.value)" (blur)="touch.emit()" />
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './text-input.scss',
})
export class TextInput extends ControlBase {
  readonly value = model<string | number | null>(null);
  readonly type = input<TextInputType>('text');
  readonly placeholder = input('');

  protected onInput(raw: string): void {
    if (this.type() !== 'number') return this.value.set(raw);
    const n = raw.trim() === '' ? NaN : Number(raw);
    this.value.set(Number.isNaN(n) ? null : n);
  }
}
