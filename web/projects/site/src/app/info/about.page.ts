import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Crumbs, ThemePicker } from '@token-derby/ui';
import { hostScale } from '../home/home-scale';
import { CHANGELOG, CLI_VERSION, SITE_VERSION, changeLines } from './release-data';

/** /about: the current versions and every release, newest first. */
@Component({
  selector: 'site-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Button, Crumbs, ThemePicker],
  host: { 'data-page': 'about', '[style.--home-scale]': 'scale()' },
  template: `
    <header class="top">
      <td-crumbs [parts]="[{ label: 'Token Derby', link: ['/'] }, { label: 'About' }]" />
      <span class="actions"><td-theme-picker compact /><a td-button size="sm" routerLink="/">← Home</a></span>
    </header>
    <main class="column">
      <p class="versions">Current · Site <b>v{{ site }}</b> · CLI <b>v{{ cli }}</b></p>
      <ol class="timeline">
        @for (e of releases; track $index) {
          <li class="entry">
            <div class="head">
              <span class="tag" [class]="e.component">{{ e.component === 'cli' ? 'CLI' : 'SITE' }}</span>
              <span class="version">v{{ e.version }}</span>
              <span class="date">{{ e.date }}</span>
            </div>
            @if (lines(e).length) { <ul>@for (c of lines(e); track $index) { <li>{{ c }}</li> }</ul> }
          </li>
        }
      </ol>
    </main>
  `,
  styleUrl: './info-page.scss',
})
export class AboutPage {
  protected readonly site = SITE_VERSION;
  protected readonly cli = CLI_VERSION;
  protected readonly releases = CHANGELOG;
  protected readonly lines = changeLines;
  protected readonly scale = hostScale();
}
