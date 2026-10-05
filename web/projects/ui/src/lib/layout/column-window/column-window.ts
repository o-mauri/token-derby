import { ChangeDetectionStrategy, Component, Directive, TemplateRef, computed, contentChildren, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Button } from '../../button/button';

/** One column inside a td-column-window: `<ng-template tdColumn header="Premier">…</ng-template>`. */
@Directive({ selector: 'ng-template[tdColumn]' })
export class ColumnTemplate {
  readonly header = input.required<string>();
  readonly template = inject(TemplateRef);
}

/** Columns side by side, at most `max` at once; arrows step through the rest, wrapping. Narrow widths stack them all. */
@Component({
  selector: 'td-column-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Button],
  template: `
    <div class="frame" [class.paged]="paged()">
      @if (paged()) {
        <button td-button size="sm" type="button" class="prev" [attr.aria-label]="'Show earlier ' + label()" (click)="step(-1)">‹</button>
      }
      <div class="cols" [style.--cols]="paged() ? max() : columns().length">
        @for (c of columns(); track $index) {
          <div class="column" [class.out]="slot($index) === null" [style.--slot]="slot($index)">
            <ng-container [ngTemplateOutlet]="c.template" />
          </div>
        }
      </div>
      @if (paged()) {
        <button td-button size="sm" type="button" class="next" [attr.aria-label]="'Show later ' + label()" (click)="step(1)">›</button>
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
  // Kept in range if the column count shrinks while the window is moved along.
  private readonly at = computed(() => this.start() % Math.max(this.columns().length, 1));

  protected readonly caption = computed(() => {
    const cols = this.columns();
    const first = cols[this.at()]!.header();
    const last = cols[(this.at() + this.max() - 1) % cols.length]!.header();
    return `${first} – ${last} · ${cols.length} ${this.label()}`.trimEnd();
  });

  /** Where column `i` sits in the window, or null when it's out of view. */
  protected slot(i: number): number | null {
    const n = this.columns().length;
    if (!this.paged()) return i;
    const offset = (i - this.at() + n) % n;
    return offset < this.max() ? offset : null;
  }

  protected step(by: number): void {
    const n = this.columns().length;
    this.start.set((this.at() + by + n) % n);
  }
}
