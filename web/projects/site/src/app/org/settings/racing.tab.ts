import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'site-racing-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tab': 'racing' },
  template: `<p class="soon">Coming next.</p>`,
})
export class RacingTab {}
