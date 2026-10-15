import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { HatRarity } from '@token-derby/shared';
import { HatCard } from '@token-derby/ui';
import { hatsOf, paletteFor } from './catalog-model';

/** One rarity's hats as cards, on the horse named in ?horse. */
@Component({
  selector: 'site-catalog-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HatCard],
  host: { '[attr.data-rarity]': 'rarity()' },
  template: `
    <div class="grid">
      @for (hat of hats(); track hat.id) { <td-hat-card [hat]="hat" [colors]="colors()" /> }
    </div>
  `,
  styles: `
    :host { flex: 1; min-height: 0; overflow-y: auto; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: var(--td-space-5); padding: var(--td-space-5) var(--td-space-6); align-items: start; }
  `,
})
export class CatalogTab {
  readonly rarity = input.required<HatRarity>();
  readonly horse = input<string | undefined>(undefined);

  protected readonly hats = computed(() => hatsOf(this.rarity()));
  protected readonly colors = computed(() => paletteFor(this.horse()).colors);
}
