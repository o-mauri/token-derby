import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'site-race-settings-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tab': 'race-settings' },
  template: `<p class="soon">Coming next.</p>`,
})
export class RaceSettingsTab {}
