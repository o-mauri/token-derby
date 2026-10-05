import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input } from '@angular/core';
import { Select } from '../forms/select/select';
import type { TdOption } from '../forms/option';
import { ThemeService } from './theme.service';
import { THEMES, type ThemeId } from './themes';

const OPTIONS: readonly TdOption<ThemeId>[] = THEMES.map((t) => ({ value: t.id, label: t.label }));

/** The site's theme switcher: a td-select wired to ThemeService. */
@Component({
  selector: 'td-theme-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Select],
  styles: `:host { display: block; min-width: 0; }`,
  template: `<td-select label="Theme" [hideLabel]="compact()" [options]="options" [value]="service.theme()" (valueChange)="pick($event)" />`,
})
export class ThemePicker {
  // Hides the "Theme" caption, for the race header.
  readonly compact = input(false, { transform: booleanAttribute });
  protected readonly service = inject(ThemeService);
  protected readonly options = OPTIONS;

  protected pick(id: ThemeId | null): void {
    if (id) this.service.set(id);
  }
}
