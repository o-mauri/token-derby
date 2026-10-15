import { Directive, booleanAttribute, computed, input, output } from '@angular/core';
import type { ValidationError } from '@angular/forms/signals';

let nextId = 0;

/** Inputs every td form control shares; Signal Forms' [formField] fills them when bound. */
@Directive()
export abstract class ControlBase {
  readonly label = input<string>('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly touched = input(false, { transform: booleanAttribute });
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);
  readonly touch = output<void>();

  protected readonly id = `td-control-${++nextId}`;
  // Errors wait for the first blur, so an untouched form doesn't open in red.
  protected readonly visibleErrors = computed(() =>
    this.touched() ? this.errors().map((e) => e.message ?? e.kind) : [],
  );
}
