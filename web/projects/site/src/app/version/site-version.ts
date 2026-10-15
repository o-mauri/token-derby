import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { REDIRECT } from '../session/redirect';

const V1_EQUIVALENT: readonly [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^\/paddock$/, () => '/'],
  [/^\/account(\/devices)?$/, () => '/org-manager'],
  [/^\/org\/([^/]+)\/(races|league|settings(\/.*)?)$/, (m) => `/org/${m[1]}`],
  [/^\/catalog\/[^/]+$/, () => '/catalog'],
  [/^\/link-google$/, () => '/link'],
];

/** Where a v2 URL lands on v1: v2-only pages go to their nearest v1 page; the hash is dropped. */
export function v1PathFor(url: string): string {
  const [pathAndQuery] = url.split('#');
  const [path, query] = (pathAndQuery || '/').split('?');
  const p = path!.replace(/\/+$/, '') || '/';
  for (const [re, to] of V1_EQUIVALENT) {
    const m = p.match(re);
    if (m) return to(m);
  }
  return query ? `${p}?${query}` : p;
}

/** Leaves v2: clears the opt-in cookie and reloads the matching v1 page. */
@Injectable({ providedIn: 'root' })
export class SiteVersion {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly redirect = inject(REDIRECT);

  useV1(): void {
    this.doc.cookie = 'td_site=; Path=/; Max-Age=0; SameSite=Lax';
    this.redirect(v1PathFor(this.router.url));
  }
}
