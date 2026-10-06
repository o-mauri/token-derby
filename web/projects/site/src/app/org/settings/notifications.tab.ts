import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'site-notifications-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tab': 'notifications' },
  template: `<p class="soon">Coming next.</p>`,
})
export class NotificationsTab {}
