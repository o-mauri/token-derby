import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { Segmented } from '../../forms/segmented/segmented';
import { Loader } from '../../loader/loader';
import { RaceChart } from '../race-chart/race-chart';
import { type ChartMode, LINE_PALETTE, chartLines, colourMap, windowEnd } from '../logic/chart';

const MODES = [{ value: 'cumulative' as ChartMode, label: 'Cumulative' }, { value: 'throughput' as ChartMode, label: 'Tokens / min' }];
const ALL = 0;

/** The race graphs: a chart picker, a league division filter, and the chart (or why there isn't one yet).
 *  The page owns loading and passes in the latest series. */
@Component({
  selector: 'td-race-graphs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Segmented, Loader, RaceChart],
  templateUrl: './race-graphs.html',
  styleUrl: './race-graphs.scss',
})
export class RaceGraphs {
  // Null until the first series arrives.
  readonly series = input.required<GetRaceSeriesResponse | null>();
  readonly failed = input(false);
  readonly horses = input.required<readonly HorseView[]>();
  readonly divisionNames = input<readonly string[] | null>(null);
  readonly nowMs = input.required<number>();

  protected readonly modes = MODES;
  protected readonly mode = signal<ChartMode>('cumulative');
  protected readonly divisionOptions = computed(() => {
    const names = this.divisionNames();
    return names?.length ? [{ value: ALL, label: 'All' }, ...names.map((label, i) => ({ value: i + 1, label }))] : null;
  });
  // Back to All whenever the chosen division no longer exists in the latest snapshot.
  protected readonly division = linkedSignal<readonly string[] | null, number>({
    source: this.divisionNames,
    computation: (names, previous) => (previous && names && previous.value <= names.length ? previous.value : ALL),
  });

  protected readonly visible = computed(() => {
    const d = this.division();
    return d === ALL ? this.horses() : this.horses().filter((h) => h.division === d);
  });
  // Colours come from the whole field, so a horse keeps its colour whatever the filter.
  protected readonly colourOf = computed(() => {
    const colours = colourMap(this.horses());
    return (h: HorseView) => colours.get(h.horse_id) ?? LINE_PALETTE[0]!;
  });
  // The series scoped to the visible horses, so an empty division reports itself rather than drawing nothing.
  protected readonly scoped = computed(() => {
    const series = this.series();
    if (!series) return null;
    const ids = new Set(this.visible().map((h) => h.horse_id));
    return { ...series, horses: series.horses.filter((h) => ids.has(h.horse_id)) };
  });
  protected readonly endMs = computed(() => {
    const series = this.series();
    return series ? windowEnd(series, this.nowMs()) : 0;
  });
  protected readonly message = computed(() => {
    if (this.failed()) return "Couldn't load the graphs. Retrying shortly.";
    const scoped = this.scoped();
    if (!scoped) return null;
    const filtered = this.division() !== ALL;
    if (this.visible().length === 0) return 'No data for this division yet.';
    if (!chartLines(this.mode(), scoped, this.visible(), this.endMs()).hasData) {
      return filtered ? 'No data for this division yet.' : 'No token data yet. Check back in a minute.';
    }
    return null;
  });
}
