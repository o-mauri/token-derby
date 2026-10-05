import { ChangeDetectionStrategy, Component, Directive, TemplateRef, computed, contentChildren, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Button } from '../../button/button';

/** One column inside a td-column-window: `<ng-template tdColumn header="Premier">…</ng-template>`. */
@Directive({ selector: 'ng-template[tdColumn]' })
export class ColumnTemplate {
  readonly header = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** Columns side by side in order, at most `max` at once; arrows slide the row along, stopping at each end.
 *  Narrow widths stack them all. */
@Component({
  selector: 'td-column-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Button],
  template: `
    <div class="frame" [class.paged]="paged()">
      @if (paged()) {
        <button td-button size="sm" type="button" class="prev" [attr.aria-label]="'Show earlier ' + label()" [attr.aria-disabled]="at() === 0" (click)="step(-1)">‹</button>
      }
      <div class="cols" [style.--cols]="paged() ? max() : columns().length">
        <div class="track" [style.--at]="at()">
        @for (c of columns(); track $index) {
          <div class="column" [class.out]="!inView($index)">
            <ng-container [ngTemplateOutlet]="c.template" />
          </div>
        }
        </div>
      </div>
      @if (paged()) {
        <button td-button size="sm" type="button" class="next" [attr.aria-label]="'Show later ' + label()" [attr.aria-disabled]="at() === last()" (click)="step(1)">›</button>
        <p class="caption">{{ caption() }}</p>
      }
    </div>
  `,
  styleUrl: './column-window.scss',
})
export class ColumnWindow {
  readonly max = input(3);
  // Plural noun for what the columns are, used in the caption and arrow labels.
  readonly label = input('');

  protected readonly columns = contentChildren(ColumnTemplate);
  private readonly start = signal(0);
  protected readonly paged = computed(() => this.columns().length > this.max());
  // The furthest the window can move; it's kept in range if the column count shrinks.
  protected readonly last = computed(() => Math.max(0, this.columns().length - this.max()));
  protected readonly at = computed(() => Math.min(this.start(), this.last()));

  protected readonly caption = computed(() => {
    const cols = this.columns();
    const first = cols[this.at()]!.header();
    const end = cols[Math.min(this.at() + this.max(), cols.length) - 1]!.header();
    return `${first} – ${end} · ${cols.length} ${this.label()}`.trimEnd();
  });

  protected inView(i: number): boolean {
    return !this.paged() || (i >= this.at() && i < this.at() + this.max());
  }

  // aria-disabled rather than disabled at the ends, so a keyboard user's focus stays on the arrow.
  protected step(by: number): void {
    this.start.set(Math.min(Math.max(this.at() + by, 0), this.last()));
  }
}
