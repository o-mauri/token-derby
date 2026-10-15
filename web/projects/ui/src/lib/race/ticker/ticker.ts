import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, signal, viewChildren } from '@angular/core';
import { FRAME_CLOCK } from '../track/auto-scroll';
import type { TickerCell } from '../logic/ticker';
import { TickerEngine, type TickerSlot } from '../logic/ticker-engine';

/** The scrolling strip along the bottom of the race: order, standings and fresh achievements.
 *  A new batch of cells takes over at the end of the current pass, so the order never jumps. */
@Component({
  selector: 'td-ticker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-empty]': 'slots().length === 0',
    '(mouseenter)': 'engine.paused = true',
    '(mouseleave)': 'engine.paused = false',
  },
  templateUrl: './ticker.html',
  styleUrl: './ticker.scss',
})
export class Ticker {
  readonly cells = input.required<TickerCell[]>();

  protected readonly engine = new TickerEngine();
  protected readonly slots = signal<readonly TickerSlot[]>([]);
  protected readonly offset = signal(0);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly clock = inject(FRAME_CLOCK);
  private readonly rendered = viewChildren<ElementRef<HTMLElement>>('slot');
  private frameId = 0;
  private last = 0;

  constructor() {
    effect(() => this.engine.setCells(this.cells()));
    afterNextRender(() => {
      this.last = this.clock.now();
      this.tick();
    });
    inject(DestroyRef).onDestroy(() => this.clock.cancel(this.frameId));
  }

  // Measure cells rendered since the last frame, then let the engine scroll, drop and append.
  private readonly tick = (): void => {
    this.frameId = this.clock.request(this.tick);
    const now = this.clock.now();
    const measured = new Map<number, number>();
    for (const ref of this.rendered()) {
      const el = ref.nativeElement;
      measured.set(Number(el.dataset['key']), el.offsetWidth);
    }
    const before = this.engine.slots.map((s) => `${s.key}:${s.width}`).join();
    this.engine.frame((now - this.last) / 1000, this.host.clientWidth, measured);
    this.last = now;
    if (this.engine.slots.map((s) => `${s.key}:${s.width}`).join() !== before) this.slots.set([...this.engine.slots]);
    this.offset.set(this.engine.offset);
  };
}
