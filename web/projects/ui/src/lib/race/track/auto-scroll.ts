import {
  DOCUMENT, DestroyRef, Directive, ElementRef, InjectionToken, Renderer2, afterNextRender, booleanAttribute, inject, input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';
import { AutoScrollController } from '../logic/autoscroll-controller';

export type FrameClock = { now(): number; request(cb: () => void): number; cancel(id: number): void };

/** Animation frames and their timestamps; a token so tests can step time by hand. */
export const FRAME_CLOCK = new InjectionToken<FrameClock>('FRAME_CLOCK', {
  factory: () => {
    const win = inject(DOCUMENT).defaultView!;
    return { now: () => win.performance.now(), request: (cb) => win.requestAnimationFrame(cb), cancel: (id) => win.cancelAnimationFrame(id) };
  },
});

/** Slowly bounces an overflowing element top to bottom and back, for unattended TV screens.
 *  Backs off while the viewer scrolls; stays still under reduced motion. */
@Directive({
  selector: '[tdAutoScroll]',
  host: {
    '(wheel)': 'suspend()',
    '(touchstart)': 'suspend()',
    '(touchmove)': 'suspend()',
    '(scroll)': 'scrolled()',
    '(window:keydown)': 'key($event)',
  },
})
export class AutoScroll {
  readonly tdAutoScroll = input(true, { transform: (v: unknown) => v === '' || booleanAttribute(v) });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  private readonly clock = inject(FRAME_CLOCK);
  private readonly reducedMotion = toSignal(
    inject(BreakpointObserver).observe('(prefers-reduced-motion: reduce)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  private readonly controller = new AutoScrollController(this.clock.now());
  private frameId = 0;

  constructor() {
    afterNextRender(() => this.tick());
    inject(DestroyRef).onDestroy(() => this.clock.cancel(this.frameId));
  }

  protected suspend(): void {
    this.controller.suspend(this.clock.now());
  }

  protected scrolled(): void {
    this.controller.scrolled(this.clock.now(), this.el.scrollTop);
  }

  protected key(event: KeyboardEvent): void {
    if (AutoScrollController.isScrollKey(event.key)) this.suspend();
  }

  private readonly tick = (): void => {
    this.frameId = this.clock.request(this.tick);
    if (!this.tdAutoScroll() || this.reducedMotion()) return;
    const y = this.controller.frame(this.clock.now(), this.el.scrollTop, this.el.scrollHeight - this.el.clientHeight);
    if (y === null) return;
    this.renderer.setProperty(this.el, 'scrollTop', y);
    this.controller.wrote(this.el.scrollTop);
  };
}
