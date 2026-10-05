import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
  }
}
