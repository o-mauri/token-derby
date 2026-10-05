import { DefaultUrlSerializer, UrlSerializer, type UrlTree } from '@angular/router';
import type { Provider } from '@angular/core';

/** Treats /race/ABC/ as /race/ABC, as the old site did, so a pasted link with a stray slash still works. */
export class TrailingSlashSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    return super.parse(url.replace(/\/+(?=$|[?#])/, '') || '/');
  }
}

export const provideTrailingSlashUrls = (): Provider => ({ provide: UrlSerializer, useClass: TrailingSlashSerializer });
