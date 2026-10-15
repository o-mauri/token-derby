import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrgLink } from '../models';

/** Your orgs as links. Fills the height it's given and scrolls inside, so the page never has to. */
@Component({
  selector: 'td-org-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { '[style.--td-org-rows]': 'reserved()' },
  template: `
    <div class="rows">
      @for (org of orgs(); track org.name) {
        <a class="row" [routerLink]="['/org', org.name]"><span class="name">{{ org.name }}</span><span class="go" aria-hidden="true">›</span></a>
      }
    </div>
  `,
  styleUrl: './org-list.scss',
})
export class OrgList {
  readonly orgs = input.required<readonly OrgLink[]>();
  // Rows kept visible however short the space: all of them, up to three.
  protected readonly reserved = computed(() => Math.min(this.orgs().length, 3));
}
