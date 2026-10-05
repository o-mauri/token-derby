import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OrgApi } from './org-api';
import { OrgData } from './org-data';

/** Hands the route's org name to the shared OrgData, so the dashboard and races page load it once between them. */
@Component({
  selector: 'site-org-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  // Here rather than on the route, so the data and its polls are destroyed with the shell.
  providers: [OrgApi, OrgData],
  host: { style: 'display: contents' },
  template: `<router-outlet />`,
})
export class OrgShell {
  readonly name = input.required<string>();

  constructor() {
    const data = inject(OrgData);
    effect(() => data.name.set(this.name()));
  }
}
