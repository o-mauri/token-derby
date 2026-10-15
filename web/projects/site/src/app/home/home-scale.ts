// The window size at which the column is drawn 1:1; bigger windows scale it up in proportion.
const BASE_WIDTH = 1200;
const BASE_HEIGHT = 720;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.8;

import { DestroyRef, ElementRef, type Signal, afterNextRender, computed, inject, signal } from '@angular/core';
import { RESIZE_OBSERVER } from '@token-derby/ui';

/** How much to scale the home column: width only ever enlarges it, height can also shrink it a little, so it always fits. */
export function homeScale(width: number, height: number): number {
  const fit = Math.min(Math.max(1, width / BASE_WIDTH), height / BASE_HEIGHT);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
}

/** The scale for the calling component's own size, kept up to date as the window changes. Call from a constructor. */
export function hostScale(): Signal<number> {
  const size = signal({ width: 0, height: 0 });
  const Observer = inject(RESIZE_OBSERVER);
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    if (!Observer) return;
    const ro = new Observer(([entry]) => size.set({ width: entry?.contentRect.width ?? 0, height: entry?.contentRect.height ?? 0 }));
    ro.observe(host);
    destroyRef.onDestroy(() => ro.disconnect());
  });
  return computed(() => homeScale(size().width, size().height));
}
