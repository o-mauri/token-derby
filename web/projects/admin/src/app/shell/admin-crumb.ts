import { Injectable, signal } from '@angular/core';

/** The last breadcrumb part a page adds after its section, such as a user's name. */
@Injectable({ providedIn: 'root' })
export class AdminCrumb {
  readonly extra = signal<string | null>(null);
}
