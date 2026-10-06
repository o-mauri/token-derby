import { ChangeDetectionStrategy, Component, ElementRef, input, linkedSignal, model, viewChildren } from '@angular/core';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';

/** One box per character of a CLI code: upper-cases, keeps only the code alphabet, and spreads a paste across the boxes. */
@Component({
  selector: 'td-code-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cells" role="group" [attr.aria-label]="label()">
      @for (i of slots; track i) {
        <input #cell class="cell" maxlength="1" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"
          [attr.aria-label]="'Character ' + (i + 1) + ' of ' + slots.length" [value]="boxes()[i]"
          (input)="typed(i, cell)" (keydown.backspace)="back(i, cell)" (focus)="cell.select()" (paste)="pasted($event)" />
      }
    </div>
  `,
  styleUrl: './code-input.scss',
})
export class CodeInput {
  readonly value = model('');
  readonly label = input.required<string>();

  protected readonly slots = Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => i);
  // One entry per box, so clearing a middle box leaves a gap instead of shifting the rest left.
  // A value set from outside refills the boxes; the value this component emitted leaves them alone.
  protected readonly boxes = linkedSignal<string, string[]>({
    source: this.value,
    computation: (value, prev) =>
      prev && prev.value.join('') === value ? prev.value : Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => value[i] ?? ''),
  });
  private readonly cells = viewChildren<ElementRef<HTMLInputElement>>('cell');

  protected typed(i: number, cell: HTMLInputElement): void {
    const ch = clean(cell.value).slice(-1);
    cell.value = ch;
    const next = [...this.boxes()];
    next[i] = ch;
    this.boxes.set(next);
    this.value.set(next.join(''));
    if (ch) this.focus(i + 1);
  }

  protected back(i: number, cell: HTMLInputElement): void {
    if (cell.value === '' && i > 0) this.focus(i - 1);
  }

  protected pasted(event: ClipboardEvent): void {
    event.preventDefault();
    const code = clean(event.clipboardData?.getData('text') ?? '').slice(0, JOIN_CODE_LENGTH);
    this.boxes.set(Array.from({ length: JOIN_CODE_LENGTH }, (_, i) => code[i] ?? ''));
    this.value.set(code);
    this.focus(Math.min(code.length, JOIN_CODE_LENGTH - 1));
  }

  private focus(i: number): void {
    this.cells()[i]?.nativeElement.focus();
  }
}

function clean(raw: string): string {
  return [...raw.toUpperCase()].filter((c) => JOIN_CODE_ALPHABET.includes(c)).join('');
}
