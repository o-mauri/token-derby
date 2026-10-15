import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, signal, viewChild, viewChildren,
} from '@angular/core';
import { ordinal } from '../../horse-chip/ordinal';
import { HorseCard } from '../horse-card/horse-card';
import { RaceLane } from '../lane/lane';
import { AutoScroll } from './auto-scroll';
import type { LaneState, LaneView } from '../models';

// Past this progress the card opens to the horse's left, so it stays on the track.
const FLIP_AT = 55;

type Geometry = { lineTop: number; lineHeight: number; rowTop: number; rowHeight: number; cardTop: number };

/** The field of lanes. Scrolls (and auto-bounces) when the field is taller than the screen.
 *  Hovering or tapping a horse shows its stats card and a line through every lane at its nose. */
@Component({
  selector: 'td-race-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HorseCard, RaceLane],
  host: { '(scroll)': 'onScroll()', '[class.scrolled]': 'scrolled()', '(document:click)': 'pinned.set(null)' },
  hostDirectives: [{ directive: AutoScroll, inputs: ['tdAutoScroll: autoScroll'] }],
  template: `
    @for (lane of lanes(); track lane.id; let i = $index, last = $last) {
      <td-race-lane [lane]="lane" [progress]="progressById()[lane.id] ?? 0" [state]="state()" [index]="i" [last]="last"
        (hover)="hover(lane.id, $event)" (tap)="tapped(lane.id)" />
    }
    @if (inspected(); as l) {
      @let g = geometry();
      <div class="lane-outline" [style.top.px]="g?.rowTop" [style.height.px]="g?.rowHeight"></div>
      <div class="nose-line" [style.--p]="inspectedProgress()" [style.top.px]="g?.lineTop" [style.height.px]="g?.lineHeight">
        <span class="flag">{{ flag() }}</span>
      </div>
      <td-horse-card class="card" [class.flip]="inspectedProgress() > flipAt" [style.--p]="inspectedProgress()"
        [style.top.px]="g?.cardTop" [style.visibility]="g ? null : 'hidden'" [lane]="l" [field]="lanes()" />
    }
  `,
  styleUrl: './track.scss',
})
export class RaceTrack {
  readonly lanes = input.required<readonly LaneView[]>();
  readonly progressById = input.required<Readonly<Record<string, number>>>();
  readonly state = input.required<LaneState>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly laneEls = viewChildren(RaceLane, { read: ElementRef });
  private readonly cardEl = viewChild(HorseCard, { read: ElementRef });
  private readonly scrollTop = signal(0);
  // At the top the box reaches under the crowd so a hat can draw over it; once scrolled, it stops there.
  protected readonly scrolled = computed(() => this.scrollTop() > 0);

  private readonly hoveredId = signal<string | null>(null);
  protected readonly pinned = signal<string | null>(null);
  protected readonly flipAt = FLIP_AT;
  protected readonly inspected = computed(() => {
    const id = this.pinned() ?? this.hoveredId();
    return this.lanes().find((l) => l.id === id) ?? null;
  });
  protected readonly inspectedProgress = computed(() => this.progressById()[this.inspected()?.id ?? ''] ?? 0);
  protected readonly flag = computed(() => ordinal(this.inspected()?.position ?? 0).toUpperCase());
  protected readonly geometry = signal<Geometry | null>(null);

  constructor() {
    // The line spans every lane; the card sits level with its horse but always inside the visible track.
    afterRenderEffect({
      earlyRead: (): Geometry | null => {
        const lane = this.inspected();
        this.scrollTop();
        const els = this.laneEls().map((e) => e.nativeElement as HTMLElement);
        const card = this.cardEl()?.nativeElement as HTMLElement | undefined;
        const index = lane ? this.lanes().indexOf(lane) : -1;
        const row = els[index];
        if (!row || !card || !els.length) return null;
        const first = els[0]!;
        const lastEl = els.at(-1)!;
        // The band above the first lane sits under the crowd (and is clipped once scrolled), so the card stays below it.
        const top = this.host.scrollTop + first.offsetTop;
        const centre = row.offsetTop + row.offsetHeight / 2 - card.offsetHeight / 2;
        const max = this.host.scrollTop + this.host.clientHeight - card.offsetHeight;
        return {
          lineTop: first.offsetTop,
          lineHeight: lastEl.offsetTop + lastEl.offsetHeight - first.offsetTop,
          rowTop: row.offsetTop, rowHeight: row.offsetHeight,
          cardTop: Math.max(top, Math.min(max, centre)),
        };
      },
      write: (g) => this.geometry.set(g()),
    });
  }

  protected hover(id: string, over: boolean): void {
    if (over) this.hoveredId.set(id);
    else if (this.hoveredId() === id) this.hoveredId.set(null);
  }

  protected tapped(id: string): void {
    this.pinned.update((p) => (p === id ? null : id));
  }

  protected onScroll(): void {
    this.scrollTop.set(this.host.scrollTop);
  }
}
