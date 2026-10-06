import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Button, ChipGroup, Crumbs, type TabLink, Tabs, type TdOption, ThemePicker } from '@token-derby/ui';
import { hostScale } from '../home/home-scale';
import { PALETTES, RARITIES, collectibles, hatsOf, paletteFor, rarityLabel } from './catalog-model';

/** /catalog: every hat, a tab per rarity, on a horse of your choosing. */
@Component({
  selector: 'site-catalog-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, Button, ChipGroup, Crumbs, Tabs, ThemePicker],
  host: { 'data-page': 'catalog', '[style.--home-scale]': 'scale()' },
  templateUrl: './catalog.shell.html',
  styleUrl: './catalog.shell.scss',
})
export class CatalogShell {
  private readonly router = inject(Router);
  readonly horse = input<string | undefined>(undefined);

  protected readonly scale = hostScale();
  protected readonly total = collectibles();
  // Relative to this route, so each tab is /catalog/<rarity>; common is /catalog itself.
  protected readonly tabs: TabLink[] = RARITIES.map((r) => ({
    label: `${rarityLabel(r)} · ${hatsOf(r).length}`, link: r === 'common' ? ['.'] : [r], color: `var(--td-rarity-${r})`,
  }));
  protected readonly palettes: TdOption<string>[] = PALETTES.map((p) => ({ value: p.key, label: p.name }));
  protected readonly picked = computed(() => [paletteFor(this.horse()).key]);

  // The chip group allows several; the catalog wants one, so the newest pick wins.
  protected pick(keys: readonly string[]): void {
    const current = this.picked()[0];
    const next = keys.find((k) => k !== current) ?? current;
    void this.router.navigate([], { queryParams: { horse: next }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
