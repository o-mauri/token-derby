import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export type TabLink = { readonly label: string; readonly link: readonly unknown[] };

/** A row of tabs that are real links, one per child route; the current one is marked. */
@Component({
  selector: 'td-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="tabs" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.label) {
        <a class="tab" [routerLink]="tab.link" routerLinkActive="on" ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="{ exact: true }"><span class="text">{{ tab.label }}</span></a>
      }
    </nav>
  `,
  styleUrl: './tabs.scss',
})
export class Tabs {
  readonly tabs = input.required<readonly TabLink[]>();
  readonly label = input.required<string>();
}
