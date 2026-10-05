import { ChangeDetectionStrategy, Component, DOCUMENT, Renderer2, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Page, ThemePicker, ThemeService } from '@token-derby/ui';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Page, ThemePicker],
  host: { class: 'td-app-root' },
  templateUrl: './app.html',
})
export class App {

  constructor() {
    inject(ThemeService);
    // The site is TV-only, and the race styles key off this body class.
    inject(Renderer2).addClass(inject(DOCUMENT).body, 'tv');
  }
}
