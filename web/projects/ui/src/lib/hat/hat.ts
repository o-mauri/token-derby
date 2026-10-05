import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { hatById } from '@token-derby/shared';
import { HatPixels, hatPixels } from './hat-pixels';

/** A hat on its own, e.g. a catalogue or inventory icon. The viewBox is cropped to its pixels. */
@Component({
  selector: 'td-hat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HatPixels],
  template: `
    @if (hat(); as h) {
      <svg class="hat-sprite" [attr.viewBox]="viewBox()" shape-rendering="crispEdges" role="img" [attr.aria-label]="h.name">
        <g tdHatPixels [hat]="h" [variant]="variant()" />
      </svg>
    }
  `,
  styles: `
    :host { display: inline-block; }
    .hat-sprite { display: block; width: 100%; height: 100%; }
  `,
})
export class Hat {
  readonly id = input.required<string>();
  readonly variant = input(0);

  protected readonly hat = computed(() => hatById(this.id()));
  protected readonly viewBox = computed(() => {
    const hat = this.hat();
    if (!hat) return null;
    const px = hatPixels(hat);
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return `${x} ${y} ${Math.max(...xs) - x + 1} ${Math.max(...ys) - y + 1}`;
  });
}
