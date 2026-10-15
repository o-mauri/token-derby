import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { Horse } from '../../horse/horse';
import { Marquee } from '../../horse-chip/marquee';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';
import type { LeaguePanelView } from '../models';

/** How many runner rows fit under a column's header and leader: whole rows only, never fewer than two. */
export function leagueRowsThatFit(bodyHeight: number, headHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 2;
  return Math.max(2, Math.floor((bodyHeight - headHeight) / rowHeight));
}

/** The dashboard's LEAGUE panel: each division's leader, then as many of its runners as the panel can hold. */
@Component({
  selector: 'td-org-league-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Horse, Marquee],
  templateUrl: './league-panel.html',
  styleUrl: './league-panel.scss',
})
export class LeaguePanel {
  readonly view = input.required<LeaguePanelView>();

  private readonly cols = viewChild<ElementRef<HTMLElement>>('cols');
  private readonly bodyHeight = signal(0);
  private readonly headHeight = signal(0);
  private readonly rowHeight = signal(0);
  protected readonly fit = computed(() => leagueRowsThatFit(this.bodyHeight(), this.headHeight(), this.rowHeight()));

  protected readonly columns = computed(() => {
    const fit = this.fit();
    return (this.view()?.columns ?? []).map((c) => {
      // The "+N more" line takes a row of its own; a tight panel drops to just 2nd place.
      const shown = c.rest.length > fit ? Math.max(1, fit - 1) : c.rest.length;
      return { ...c, shown: c.rest.slice(0, shown), more: c.rest.length - shown };
    });
  });
  protected readonly toGo = computed(() => {
    const v = this.view();
    return v ? Math.max(0, v.total - v.round) : 0;
  });

  constructor() {
    const Observer = inject(RESIZE_OBSERVER);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.cols()?.nativeElement;
      if (!Observer || !el) return;
      const ro = new Observer(([entry]) => this.bodyHeight.set(entry?.contentRect.height ?? 0));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
    // Row and header sizes come from the rendered first column, so they follow the theme's fonts.
    afterRenderEffect({
      earlyRead: () => {
        const el = this.cols()?.nativeElement;
        const top = el?.querySelector<HTMLElement>('.top')?.offsetHeight ?? 0;
        const row = el?.querySelector<HTMLElement>('.runner')?.offsetHeight ?? 0;
        return { top, row };
      },
      write: (m) => this.measure(m().top, m().row),
    });
  }

  /** Records the header and row heights; zero readings (nothing rendered yet) are ignored. */
  measure(headHeight: number, rowHeight: number): void {
    if (headHeight > 0) this.headHeight.set(headHeight);
    if (rowHeight > 0) this.rowHeight.set(rowHeight);
  }
}
