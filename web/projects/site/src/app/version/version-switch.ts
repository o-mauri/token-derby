import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VersionSwitch } from '@token-derby/ui';
import { SiteVersion } from './site-version';

/** The V2 switch for v2 page headers: on, and pressing it goes back to v1. */
@Component({
  selector: 'site-version-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VersionSwitch],
  template: `<td-version-switch on (switched)="version.useV1()" />`,
})
export class SiteVersionSwitch {
  protected readonly version = inject(SiteVersion);
}
