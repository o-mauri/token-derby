import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { ControlBase } from '../control-base';

const STEP_KEYS: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

/** Range slider over a native input, with a formatted readout and optional default marker. */
@Component({
  selector: 'td-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--fill]': 'fill()' },
  template: `
    <div class="head">
      @if (label()) { <label class="label" [for]="id">{{ label() }}</label> }
      <span class="readout">{{ format()(value()) }}
        @if (defaultValue() !== undefined) { <span class="muted">(default {{ format()(defaultValue()!) }})</span> }
      </span>
    </div>
    <div class="track">
      <input #range type="range" [id]="id" [min]="lo()" [max]="hi()" [step]="step()" [value]="value()"
        [disabled]="disabled()" (input)="value.set(+range.value)" (keydown)="onKey($event)" (blur)="touch.emit()" />
      @if (defaultPct(); as pct) { <span class="default-marker" [style.left]="pct" aria-hidden="true"></span> }
    </div>
    @for (e of visibleErrors(); track $index) { <p class="error">{{ e }}</p> }
  `,
  styleUrl: './slider.scss',
})
export class Slider extends ControlBase {
  readonly value = model(0);
  // Optional so Signal Forms' min()/max() rules can supply the bounds instead.
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  protected readonly lo = computed(() => this.min() ?? 0);
  protected readonly hi = computed(() => this.max() ?? 100);
  readonly step = input(1);
  readonly defaultValue = input<number | undefined>(undefined);
  readonly format = input<(n: number) => string>(String);

  protected readonly fill = computed(() => `${this.pct(this.value())}%`);
  protected readonly defaultPct = computed(() => {
    const d = this.defaultValue();
    return d === undefined ? null : `${this.pct(d)}%`;
  });

  // Keys are handled here so stepping and clamping behave the same in every browser.
  protected onKey(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const bounds: Record<string, number> = { Home: this.lo(), End: this.hi() };
    const dir = STEP_KEYS[event.key];
    if (dir === undefined && !(event.key in bounds)) return;
    event.preventDefault();
    const next = dir === undefined ? bounds[event.key]! : this.value() + dir * this.step();
    this.value.set(this.clamp(next));
  }

  private clamp(n: number): number {
    const decimals = (String(this.step()).split('.')[1] ?? '').length;
    return Math.min(this.hi(), Math.max(this.lo(), Number(n.toFixed(decimals))));
  }

  private pct(n: number): number {
    const span = this.hi() - this.lo();
    return span <= 0 ? 0 : Math.round(((n - this.lo()) / span) * 1000) / 10;
  }
}
