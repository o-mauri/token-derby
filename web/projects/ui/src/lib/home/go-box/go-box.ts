import { ChangeDetectionStrategy, Component, booleanAttribute, input, output, signal } from '@angular/core';
import { Button } from '../../button/button';

let nextId = 0;

/** One text box and a button: checks the value against a pattern and emits it cleaned up. The page decides where to go. */
@Component({
  selector: 'td-go-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <form class="box" (submit)="submit($event)" autocomplete="off" novalidate>
      <label class="label" [for]="id">{{ label() }}</label>
      <input #field class="field" [id]="id" [placeholder]="placeholder()" [attr.maxlength]="maxLength()"
        [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? id + '-error' : null"
        [value]="value()" (input)="edit(field.value)" />
      <button td-button type="submit">{{ action() }}</button>
    </form>
    @if (error()) { <p class="error" [id]="id + '-error'" role="alert">{{ invalidText() }}</p> }
  `,
  styleUrl: './go-box.scss',
})
export class GoBox {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly pattern = input.required<RegExp>();
  readonly maxLength = input<number | null>(null);
  readonly invalidText = input.required<string>();
  readonly action = input.required<string>();
  readonly upper = input(false, { transform: booleanAttribute });
  readonly go = output<string>();

  protected readonly id = `td-go-box-${++nextId}`;
  protected readonly value = signal('');
  protected readonly error = signal(false);

  protected edit(raw: string): void {
    this.value.set(raw);
    this.error.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const trimmed = this.value().trim();
    const clean = this.upper() ? trimmed.toUpperCase() : trimmed;
    if (!this.pattern().test(clean)) return this.error.set(true);
    this.go.emit(clean);
  }
}
