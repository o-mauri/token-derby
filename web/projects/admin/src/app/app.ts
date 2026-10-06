import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeBackdrop, ThemeService } from '@token-derby/ui';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeBackdrop],
  host: { class: 'td-app-root' },
  templateUrl: './app.html',
})
export class App {
  constructor() {
    inject(ThemeService);
  }
}
