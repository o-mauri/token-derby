import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** Leaves the app for another site (Google's sign-in); a token so tests can catch the address instead. */
export const REDIRECT = new InjectionToken<(url: string) => void>('REDIRECT', {
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    return (url: string) => win?.location.assign(url);
  },
});
