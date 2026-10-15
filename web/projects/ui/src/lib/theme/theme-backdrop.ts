import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Page-wide theme weather: London's fog and rain, Matrix's glyph rain. Other themes hide it. */
@Component({
  selector: 'td-theme-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<div class="fog"></div><div class="rain"><i></i><i></i><i></i></div>`,
  styleUrl: './theme-backdrop.scss',
})
export class ThemeBackdrop {}
