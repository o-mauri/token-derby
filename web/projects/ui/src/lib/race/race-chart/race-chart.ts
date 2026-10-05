import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';
import { CHART_H, CHART_W, type ChartMode, chartGeometry, chartLines, fitWidth } from '../logic/chart';

const TITLES: Record<ChartMode, string> = {
  // Deliberately different quantities: cumulative is scored distance (what horses are ranked by), pace is raw production.
  cumulative: 'Cumulative scored tokens',
  throughput: 'Tokens produced / min (30-min avg)',
};

/** One race chart: title, a line per horse, and a legend. Re-fits its drawing width to its box. */
@Component({
  selector: 'td-race-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './race-chart.html',
  styleUrl: './race-chart.scss',
})
export class RaceChart {
  readonly mode = input.required<ChartMode>();
  readonly series = input.required<GetRaceSeriesResponse>();
  readonly horses = input.required<readonly HorseView[]>();
  // Live races pass now, so lines don't run flat to the scheduled end.
  readonly endMs = input<number | null>(null);
  // Live races pass a stable per-horse colour, so overtakes don't swap colours.
  readonly colourOf = input<((h: HorseView) => string) | null>(null);

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  private readonly width = signal(CHART_W);
  protected readonly height = CHART_H;
  protected readonly title = computed(() => TITLES[this.mode()]);
  protected readonly data = computed(() =>
    chartLines(this.mode(), this.series(), this.horses(), this.endMs() ?? this.series().end_ms, this.colourOf() ?? undefined),
  );
  protected readonly geo = computed(() => chartGeometry(this.data(), this.mode(), this.width()));
  protected readonly label = computed(() => `${this.title()} for ${this.data().lines.length} horses`);
  // The horse being picked out by hover, focus or tap; the rest of the lines are muted.
  protected readonly active = signal<string | null>(null);
  // Picked-out line drawn last, so it sits on top of the others.
  protected readonly ordered = computed(() => {
    const lines = this.geo().lines;
    const id = this.active();
    return id === null ? lines : [...lines.filter((l) => l.id !== id), ...lines.filter((l) => l.id === id)];
  });

  protected pick(id: string | null): void {
    this.active.set(id);
  }

  protected toggle(id: string): void {
    this.active.set(this.active() === id ? null : id);
  }

  constructor() {
    const Observer = inject(RESIZE_OBSERVER);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.svg()?.nativeElement;
      if (!Observer || !el) return;
      const ro = new Observer(([entry]) => {
        const { width, height } = entry?.contentRect ?? { width: 0, height: 0 };
        if (width > 0 && height > 0) this.width.set(fitWidth(width, height));
      });
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }
}
