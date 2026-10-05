import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Page, ThemePicker } from '@token-derby/ui';

// Placeholder until the home page redesign lands.
@Component({
  selector: 'site-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Page, ThemePicker],
  host: { 'data-page': 'home' },
  template: `
    <td-page>
      <div tdPageHeader class="top"><td-theme-picker compact /></div>
      <p class="soon">Token Derby v2. The home page is being redesigned.</p>
    </td-page>
  `,
  styles: `
    .top { display: flex; justify-content: flex-end; padding: var(--td-space-5); }
    .soon { margin: auto; color: var(--td-text-muted); }
  `,
})
export class HomePage {}
