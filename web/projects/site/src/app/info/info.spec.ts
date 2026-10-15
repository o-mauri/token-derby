import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { RESIZE_OBSERVER } from '@token-derby/ui';
import { routes } from '../app.routes';
import { CHANGELOG, CLI_VERSION, SITE_VERSION, changeLines } from './release-data';

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), { provide: RESIZE_OBSERVER, useValue: null }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  return harness.routeNativeElement as HTMLElement;
}

describe('/about', () => {
  it('shows both current versions', async () => {
    const el = await open('/about');
    const current = el.querySelector('.versions')?.textContent ?? '';
    expect(current).toContain(`Site v${SITE_VERSION}`);
    expect(current).toContain(`CLI v${CLI_VERSION}`);
    expect(SITE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('lists every release in the order the release script wrote them', async () => {
    const el = await open('/about');
    const entries = [...el.querySelectorAll('li.entry')];
    expect(entries).toHaveLength(CHANGELOG.length);
    expect(entries[0]!.querySelector('.version')?.textContent?.trim()).toBe(`v${CHANGELOG[0]!.version}`);
    const firstCli = CHANGELOG.findIndex((e) => e.component === 'cli');
    if (firstCli >= 0) expect(entries[firstCli]!.querySelector('.tag.cli')?.textContent?.trim()).toBe('CLI');
  });

  it('handles a release with no lines', () => {
    expect(changeLines({ version: '1.0.0', date: '2026-01-01', component: 'site', changes: [] })).toEqual([]);
  });

  it('has the breadcrumb', async () => {
    expect((await open('/about')).querySelector('td-crumbs .here')?.textContent?.trim()).toBe('About');
  });
});

describe('/privacy', () => {
  it('keeps its sections and says what the website stores', async () => {
    const el = await open('/privacy');
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual(['What is stored', 'What is not stored', 'Sharing', 'Deletion']);
    expect(el.textContent).toContain('a session token is kept in your browser so you stay signed in. Signing out deletes it.');
    expect(el.querySelector('td-crumbs .here')?.textContent?.trim()).toBe('Privacy');
  });
});
