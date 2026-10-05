import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MonthLink } from '../models';

/** Steps through months of results; an end with nothing beyond it fades and isn't a link. */
@Component({
  selector: 'td-month-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (prev(); as p) {
      <a class="prev" [routerLink]="[]" [queryParams]="{ month: p.key }" [attr.aria-label]="'Previous month, ' + p.label">‹<span class="lbl"> {{ p.label }}</span></a>
    } @else {
      <span class="prev end" role="link" aria-disabled="true" aria-label="No earlier month">‹</span>
    }
    <span class="month">{{ label() }} <span class="count">· {{ count() }} races</span></span>
    @if (next(); as n) {
      <a class="next" [routerLink]="[]" [queryParams]="{ month: n.key }" [attr.aria-label]="'Next month, ' + n.label"><span class="lbl">{{ n.label }} </span>›</a>
    } @else {
      <span class="next end" role="link" aria-disabled="true" aria-label="No later month">›</span>
    }
  `,
  styleUrl: './month-pager.scss',
})
export class MonthPager {
  readonly label = input.required<string>();
  readonly count = input.required<number>();
  readonly prev = input<MonthLink | null>(null);
  readonly next = input<MonthLink | null>(null);
}
