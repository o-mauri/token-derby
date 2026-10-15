import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotFound, Page } from '@token-derby/ui';
import { SiteVersionSwitch } from '../version/version-switch';

@Component({
  selector: 'site-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Page, NotFound, SiteVersionSwitch],
  template: `
    <td-page>
      <div tdPageHeader class="top"><site-version-switch /></div>
      <td-not-found title="Page not found" [message]="message" backLabel="← Home" (back)="router.navigate(['/'])" />
    </td-page>
  `,
})
export class NotFoundPage {
  protected readonly router = inject(Router);
  protected readonly message = ["There's nothing at this address."];
}
