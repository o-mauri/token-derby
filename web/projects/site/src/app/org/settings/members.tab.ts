import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'site-members-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tab': 'members' },
  template: `<p class="soon">Coming next.</p>`,
})
export class MembersTab {}
