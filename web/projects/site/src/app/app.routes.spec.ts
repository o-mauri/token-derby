import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';
import { provideTrailingSlashUrls } from './trailing-slash';

async function go(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), provideTrailingSlashUrls(), provideHttpClient(), provideHttpClientTesting()],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return harness.routeNativeElement as HTMLElement;
}

describe('site routes', () => {
  it('maps / to home', async () => {
    expect((await go('/')).getAttribute('data-page')).toBe('home');
  });

  it('maps /race/ABC123 to the race page', async () => {
    expect((await go('/race/ABC123')).getAttribute('data-page')).toBe('race');
  });

  it('accepts lower-case race codes (the page upper-cases them)', async () => {
    expect((await go('/race/abc123')).getAttribute('data-page')).toBe('race');
  });

  it('strips a trailing slash', async () => {
    expect((await go('/race/ABC123/')).getAttribute('data-page')).toBe('race');
  });

  it.each(['/race/AB-123', '/race/', '/nope', '/race/ABC/extra'])('renders not-found for %s', async (url) => {
    const el = await go(url);
    expect(el.querySelector('td-not-found h2')?.textContent).toBe('Page not found');
  });
});
