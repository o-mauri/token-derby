import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';

let nextId = 0;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A list of email domains as chips, with a box to add more. Entries are cleaned up and checked before they're added. */
@Component({
  selector: 'td-domain-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label" [for]="id">{{ label() }}</label>
    @if (value().length) {
      <ul class="chips">
        @for (d of value(); track d) {
          <li class="chip">{{ d }}<button type="button" class="remove" [attr.aria-label]="'Remove ' + d" (click)="remove(d)">✕</button></li>
        }
      </ul>
    }
    <div class="row">
      <input #box class="add" [id]="id" placeholder="example.com" autocomplete="off" spellcheck="false"
        [attr.aria-invalid]="error() ? 'true' : null" (input)="edit(box.value)" (keydown.enter)="add($event, box)" />
      <button type="button" class="add-btn" (click)="add($event, box)">Add</button>
    </div>
    @if (error()) { <p class="error" role="alert">Enter a domain like example.com</p> }
  `,
  styleUrl: './domain-list.scss',
})
export class DomainList {
  readonly value = model<readonly string[]>([]);
  readonly label = input.required<string>();

  protected readonly id = `td-domain-list-${++nextId}`;
  protected readonly draft = signal('');
  protected readonly error = signal(false);

  protected edit(text: string): void {
    this.draft.set(text);
    this.error.set(false);
  }

  protected add(event: Event, box: HTMLInputElement): void {
    event.preventDefault();
    const domain = this.draft().trim().toLowerCase().replace(/^@/, '');
    if (!DOMAIN.test(domain)) return this.error.set(true);
    if (!this.value().includes(domain)) this.value.set([...this.value(), domain]);
    this.draft.set('');
    box.value = '';
  }

  protected remove(domain: string): void {
    this.value.set(this.value().filter((d) => d !== domain));
  }
}
