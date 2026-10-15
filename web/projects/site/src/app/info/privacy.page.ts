import { SiteVersionSwitch } from '../version/version-switch';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Crumbs, ThemePicker } from '@token-derby/ui';

/** /privacy: what Token Derby keeps about you, and what it doesn't. */
@Component({
  selector: 'site-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteVersionSwitch, RouterLink, Button, Crumbs, ThemePicker],
  host: { 'data-page': 'privacy' },
  template: `
    <header class="top">
      <td-crumbs [parts]="[{ label: 'Token Derby', link: ['/'] }, { label: 'Privacy' }]" />
      <span class="actions"><site-version-switch /><td-theme-picker compact /><a td-button size="sm" routerLink="/">← Home</a></span>
    </header>
    <main class="column prose">
      <p>Token Derby is a hobby project that races a horse for every participant,
        where distance comes from the output tokens your AI coding tool produced.</p>
      <h2>What is stored</h2>
      <ul>
        <li>Your display name, so races and leaderboards can show who is who.</li>
        <li>Your email address and Google account id, if you sign in with Google — used only to identify your account on return visits.</li>
        <li>Token counts, race results and horse customisations.</li>
        <li>When you sign in on the website, a session token is kept in your browser so you stay signed in. Signing out deletes it.</li>
      </ul>
      <h2>What is not stored</h2>
      <ul>
        <li>The contents of your prompts, code or conversations. Only counts are sent.</li>
        <li>Payment details. Nothing here is paid for.</li>
      </ul>
      <h2>Sharing</h2>
      <p>Nothing is sold or shared with third parties. Names and results are visible to other members of organisations you join, and on race pages you share.</p>
      <h2>Deletion</h2>
      <p>Ask and your account and its data will be removed.</p>
    </main>
  `,
  styleUrl: './info-page.scss',
})
export class PrivacyPage {}
