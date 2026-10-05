import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Page frame: optional header slot above a flex column that the loader and
 *  not-found blocks centre themselves in. */
@Component({
  selector: 'td-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header"><ng-content select="[tdPageHeader]" /></header>
    <main class="body"><ng-content /></main>
  `,
  styles: `
    :host { flex: 1; display: flex; flex-direction: column; min-height: 0; }
    .header:empty { display: none; }
    .body { flex: 1; display: flex; flex-direction: column; }
  `,
})
export class Page {}
