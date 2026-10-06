import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'site-access-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tab': 'access' },
  template: `<p class="soon">Coming next.</p>`,
})
export class AccessTab {}
