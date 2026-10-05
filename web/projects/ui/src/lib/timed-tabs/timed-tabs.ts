import {
  ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, TemplateRef, afterNextRender, booleanAttribute, computed,
  contentChildren, effect, inject, input, model, signal, untracked, viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { FRAME_CLOCK } from '../race/track/auto-scroll';

/** One view inside a td-timed-tabs: `<ng-template tdTab label="Board">…</ng-template>`. */
@Directive({ selector: 'ng-template[tdTab]' })
export class TimedTab {
  readonly label = input.required<string>();
  readonly template = inject(TemplateRef);
}

const SWIPE_PX = 40;
const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);
let nextId = 0;

/** Tabs that move on by themselves: the active tab's underline fills over `interval`, then the next one shows.
 *  Click or arrow keys to jump, hover to pause, swipe on touch. */
@Component({
  selector: 'td-timed-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { '[class.still]': 'reducedMotion()', '(mouseenter)': 'hovered.set(true)', '(mouseleave)': 'hovered.set(false)' },
  templateUrl: './timed-tabs.html',
  styleUrl: './timed-tabs.scss',
})
export class TimedTabs {
  readonly interval = input(10_000);
  readonly paused = input(false, { transform: booleanAttribute });
  readonly selected = model(0);
  // Tabs handed in by a wrapping component, which content queries can't see through <ng-content>.
  readonly extraTabs = input<readonly TimedTab[]>([]);

  private readonly ownTabs = contentChildren(TimedTab);
  protected readonly tabs = computed(() => [...this.ownTabs(), ...this.extraTabs()]);
  protected readonly hovered = signal(false);
  protected readonly progress = signal(0);
  protected readonly id = `td-tabs-${++nextId}`;
  protected readonly active = computed(() => this.tabs()[this.selected()] ?? this.tabs()[0]);
  protected readonly reducedMotion = toSignal(
    inject(BreakpointObserver).observe('(prefers-reduced-motion: reduce)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  private readonly tabEls = viewChildren<ElementRef<HTMLElement>>('tab');
  private readonly clock = inject(FRAME_CLOCK);
  private frameId = 0;
  private last = 0;
  private swipeFrom: number | null = null;

  constructor() {
    // Any change of tab, by timer or by hand, restarts the timer.
    effect(() => {
      this.selected();
      untracked(() => this.progress.set(0));
    });
    afterNextRender(() => {
      this.last = this.clock.now();
      this.tick();
    });
    inject(DestroyRef).onDestroy(() => this.clock.cancel(this.frameId));
  }

  protected select(index: number, focus = false): void {
    const n = this.tabs().length;
    if (n === 0) return;
    const next = ((index % n) + n) % n;
    this.selected.set(next);
    this.progress.set(0);
    if (focus) this.tabEls()[next]?.nativeElement.focus();
  }

  protected onKey(event: KeyboardEvent): void {
    if (!NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    const i = this.selected();
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: this.tabs().length - 1 }[event.key]!;
    this.select(target, true);
  }

  protected pointerDown(event: PointerEvent): void {
    this.swipeFrom = event.clientX;
  }

  protected pointerUp(event: PointerEvent): void {
    if (this.swipeFrom === null) return;
    const dx = event.clientX - this.swipeFrom;
    this.swipeFrom = null;
    if (Math.abs(dx) >= SWIPE_PX) this.select(this.selected() + (dx < 0 ? 1 : -1));
  }

  private readonly tick = (): void => {
    this.frameId = this.clock.request(this.tick);
    const now = this.clock.now();
    const dt = now - this.last;
    this.last = now;
    if (this.paused() || this.hovered() || this.tabs().length < 2) return;
    const p = this.progress() + dt / this.interval();
    // A hair under 1 counts as done, so float drift never costs an extra frame.
    if (p >= 1 - 1e-9) this.select(this.selected() + 1);
    else this.progress.set(p);
  };
}
