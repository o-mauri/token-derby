import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/** Where the session is kept: localStorage, or null when the browser refuses it. */
export const SESSION_STORAGE = new InjectionToken<Storage | null>('SESSION_STORAGE', {
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

// The first three are the old site's keys, so a session carries over at cutover.
export const SESSION_KEYS = {
  token: 'td_org_session',
  uid: 'td_org_uid',
  email: 'td_org_linked_email',
  expires: 'td_session_expires',
  name: 'td_session_name',
} as const;
