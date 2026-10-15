import { DOCUMENT, Directive, ElementRef, afterRenderEffect, computed, inject, input, signal } from '@angular/core';

/** Scrolls its element sideways when it overflows its parent row.
 *  Re-measures when the bound text changes and once web fonts have loaded. */
@Directive({
  selector: '[tdMarquee]',
  host: {
    // Inline elements report no scroll width, so the measured element must be a box.
    style: 'display: inline-block',
    '[class.scrolling]': 'shift() !== null',
    '[style.--shift]': 'shiftPx()',
  },
})
export class Marquee {
  readonly tdMarquee = input<unknown>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly fontsLoaded = signal(false);
  protected readonly shift = signal<number | null>(null);
  protected readonly shiftPx = computed(() => (this.shift() === null ? null : `${this.shift()}px`));

  constructor() {
    inject(DOCUMENT).fonts?.ready.then(() => this.fontsLoaded.set(true));
    afterRenderEffect({
      earlyRead: () => {
        this.tdMarquee();
        this.fontsLoaded();
        const row = this.el.parentElement;
        return row ? this.el.scrollWidth - row.clientWidth : 0;
      },
      write: (overflow) => this.shift.set(overflow() > 1 ? -overflow() : null),
    });
  }
}
