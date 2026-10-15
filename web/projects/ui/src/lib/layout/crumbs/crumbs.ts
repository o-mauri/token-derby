import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HorseFace } from '../../horse-face/horse-face';

/** One step of the breadcrumb. `key` adds a class for styling or tests; `link` makes an earlier step clickable. */
export type Crumb = { readonly label: string; readonly link?: readonly unknown[] | null; readonly key?: string };

/** The page breadcrumb at the top of every page: logo, then a chevron per step, the current one filled. Earlier steps link back. */
@Component({
  selector: 'td-crumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HorseFace],
  template: `
    <nav class="crumbs" aria-label="Breadcrumb">
      <td-horse-face class="face" />
      @for (part of parts(); track $index; let end = $last) {
        @let last = end && !tail();
        @if (part.link && !last) {
          <a class="part seg link" [class]="part.key ?? ''" [routerLink]="part.link"><span class="text">{{ part.label }}</span></a>
        } @else {
          <span class="part seg" [class]="part.key ?? ''" [class.here]="last" [attr.aria-current]="last ? 'page' : null"><span class="text">{{ part.label }}</span></span>
        }
      }
      @if (tail()) {
        <span class="part seg here tail" aria-current="page"><span class="text"><ng-content /></span></span>
      }
    </nav>
  `,
  styleUrl: './crumbs.scss',
})
export class Crumbs {
  readonly parts = input.required<readonly Crumb[]>();
  /** The current step is the projected content (a race name that scrolls, say) instead of the last part. */
  readonly tail = input(false, { transform: booleanAttribute });
}
