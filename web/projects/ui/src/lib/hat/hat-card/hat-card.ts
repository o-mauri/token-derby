import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type Hat, type HorseColors, hatColors, isAnimatedHat, variantCount } from '@token-derby/shared';
import { Horse } from '../../horse/horse';

/** WCAG relative luminance of a #rrggbb colour; anything unparseable reads as bright. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 1;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

/** A hat whose main colour would vanish against the dark card gets a light backing. */
export function needsLightBg(hat: Hat, variant: number): boolean {
  return relativeLuminance(hatColors(hat, variant).A) < 0.18;
}

/** One hat in the catalog: its name, then every variant worn by a horse in the chosen colours. */
@Component({
  selector: 'td-hat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse],
  template: `
    <h3 class="name">{{ hat().name }} @if (!hat().rollable) { <span class="exclusive">Exclusive</span> }</h3>
    <div class="variants">
      @for (v of variants(); track v.index) {
        <figure class="variant" [class.light]="v.light" [class.solo]="v.solo">
          <td-horse class="horse" [colors]="colors()" [hat]="{ id: hat().id, variant: v.index }" />
          <figcaption>{{ v.caption }}</figcaption>
        </figure>
      }
    </div>
  `,
  styleUrl: './hat-card.scss',
})
export class HatCard {
  readonly hat = input.required<Hat>();
  readonly colors = input.required<HorseColors>();

  protected readonly variants = computed(() => {
    const hat = this.hat();
    if (isAnimatedHat(hat)) return [{ index: 0, caption: 'one of a kind', light: false, solo: true }];
    return Array.from({ length: variantCount(hat) }, (_, index) => ({ index, caption: `#${index + 1}`, light: needsLightBg(hat, index), solo: false }));
  });
}
