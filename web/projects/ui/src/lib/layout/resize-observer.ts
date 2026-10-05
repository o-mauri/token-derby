import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** The browser's ResizeObserver, injectable so tests can drive sizes; null where it doesn't exist. */
export const RESIZE_OBSERVER = new InjectionToken<typeof ResizeObserver | null>('RESIZE_OBSERVER', {
  factory: () => inject(DOCUMENT).defaultView?.ResizeObserver ?? null,
});
