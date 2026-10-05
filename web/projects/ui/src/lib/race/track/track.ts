import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';
import { RaceLane } from '../lane/lane';
import { AutoScroll } from './auto-scroll';
import type { LaneState, LaneView } from '../models';

/** The field of lanes. Scrolls (and auto-bounces) when the field is taller than the screen. */
@Component({
  selector: 'td-race-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RaceLane],
  host: { '(scroll)': 'onScroll()', '[class.scrolled]': 'scrolled()' },
  hostDirectives: [{ directive: AutoScroll, inputs: ['tdAutoScroll: autoScroll'] }],
  template: `
    @for (lane of lanes(); track lane.id; let i = $index, last = $last) {
      <td-race-lane [lane]="lane" [progress]="progressById()[lane.id] ?? 0" [state]="state()" [index]="i" [last]="last" />
    }
  `,
  styleUrl: './track.scss',
})
export class RaceTrack {
  readonly lanes = input.required<readonly LaneView[]>();
  readonly progressById = input.required<Readonly<Record<string, number>>>();
  readonly state = input.required<LaneState>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  // At the top the box reaches under the crowd so a hat can draw over it; once scrolled, it stops there.
  protected readonly scrolled = signal(false);

  protected onScroll(): void {
    this.scrolled.set(this.host.nativeElement.scrollTop > 0);
  }
}
