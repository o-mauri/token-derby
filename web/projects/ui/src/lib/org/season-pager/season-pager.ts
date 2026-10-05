import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SeasonLink } from '../models';

/** Steps between league seasons: the current one shows its progress, a past one is marked final with its champion. */
@Component({
  selector: 'td-season-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './season-pager.html',
  styleUrl: './season-pager.scss',
})
export class SeasonPager {
  readonly label = input.required<string>();
  // Null for a past season, which is shown as final.
  readonly progress = input<{ round: number; total: number } | null>(null);
  readonly champion = input<{ name: string; owner: string; division: string } | null>(null);
  readonly prev = input<SeasonLink | null>(null);
  readonly next = input<SeasonLink | null>(null);

  protected readonly pct = computed(() => {
    const p = this.progress();
    return p && p.total > 0 ? Math.min(100, Math.max(0, (p.round / p.total) * 100)) : 0;
  });
  protected readonly toGo = computed(() => {
    const p = this.progress();
    return p ? Math.max(0, p.total - p.round) : 0;
  });
}
