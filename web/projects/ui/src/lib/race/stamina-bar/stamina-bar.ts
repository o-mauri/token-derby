import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { staminaFillPx } from '../logic/stamina';
import type { StaminaBand } from '../models';

/** A horse's stamina reserve: a small capsule under the sprite, coloured by band. */
@Component({
  selector: 'td-stamina-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'meter',
    'aria-label': 'Stamina',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'value()',
    '[class]': 'band()',
  },
  template: `<div class="fill" [style.width.px]="fillPx()"></div>`,
  styleUrl: './stamina-bar.scss',
})
export class StaminaBar {
  readonly value = input.required<number>();
  readonly band = input.required<StaminaBand>();

  protected readonly fillPx = computed(() => staminaFillPx(this.value()));
}
