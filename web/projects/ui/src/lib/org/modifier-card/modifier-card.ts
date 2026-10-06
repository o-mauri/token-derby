import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { Modifier, ModifierSetting } from '@token-derby/shared';
import { Slider } from '../../forms/slider/slider';
import { Toggle } from '../../forms/toggle/toggle';

const fmt = (n: number) => Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);

/** One race modifier: an on/off switch, its tuning sliders when on, and what that tuning means in plain words. */
@Component({
  selector: 'td-modifier-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toggle, Slider],
  template: `
    <div class="head">
      <td-toggle [label]="modifier().label" [checked]="enabled()" (checkedChange)="setEnabled($event)" />
      <p class="description">{{ modifier().description }}</p>
    </div>
    @if (enabled()) {
      <div class="sliders">
        @for (p of bounds(); track p.key) {
          <td-slider [label]="p.bound.label" [min]="p.bound.min" [max]="p.bound.max" [step]="p.bound.step"
            [defaultValue]="p.bound.default" [format]="fmt" [value]="params()[p.key]!" (valueChange)="setParam(p.key, $event)" />
        }
      </div>
      @if (readout().length) {
        <div class="readout"><h4 class="readout-title">What this means</h4>
          <ul>@for (row of readout(); track row.label) { <li>{{ row.label }} <strong>{{ row.value }}</strong></li> }</ul>
        </div>
      }
    }
  `,
  styleUrl: './modifier-card.scss',
})
export class ModifierCard {
  readonly modifier = input.required<Modifier>();
  readonly value = input<ModifierSetting | undefined>(undefined);
  readonly valueChange = output<ModifierSetting>();

  protected readonly fmt = fmt;
  protected readonly enabled = computed(() => this.value()?.enabled ?? this.modifier().enabledByDefault);
  protected readonly bounds = computed(() => Object.entries(this.modifier().params).map(([key, bound]) => ({ key, bound })));
  // Every setting, with the modifier's defaults for anything not tuned.
  protected readonly params = computed(() => {
    const set = this.value()?.params ?? {};
    return Object.fromEntries(this.bounds().map(({ key, bound }) => [key, Number.isFinite(set[key]) ? set[key]! : bound.default]));
  });
  protected readonly readout = computed(() => this.modifier().preview?.(this.params()) ?? []);

  protected setEnabled(on: boolean): void {
    this.valueChange.emit({ enabled: on, params: this.params() });
  }

  protected setParam(key: string, n: number): void {
    this.valueChange.emit({ enabled: this.enabled(), params: { ...this.params(), [key]: n } });
  }
}
