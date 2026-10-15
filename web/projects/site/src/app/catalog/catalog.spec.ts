import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { HATS, variantCount } from '@token-derby/shared';
import { Horse, RESIZE_OBSERVER } from '@token-derby/ui';
import { routes } from '../app.routes';
import { RARITIES, collectibles, hatsOf, paletteFor } from './catalog-model';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting(), { provide: RESIZE_OBSERVER, useValue: null }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  return { harness, settle, el: () => harness.routeNativeElement as HTMLElement, router: () => TestBed.inject(Router) };
}

describe('catalog model', () => {
  it('falls back to chestnut for an unknown horse', () => {
    expect(paletteFor('black').name).toBe('Black');
    expect(paletteFor('purple').key).toBe('chestnut');
    expect(paletteFor(undefined).key).toBe('chestnut');
  });

  it('counts every variant of every hat', () => {
    expect(collectibles()).toBe(HATS.reduce((n, h) => n + variantCount(h), 0));
    expect(RARITIES.flatMap((r) => hatsOf(r))).toHaveLength(HATS.length);
  });
});

describe('/catalog', () => {
  it('opens on common, with a tab and count per rarity', async () => {
    const { el } = await open('/catalog');
    const tabs = [...el().querySelectorAll('td-tabs a.tab')].map((a) => a.textContent?.trim());
    expect(tabs).toEqual(RARITIES.map((r) => `${r[0]!.toUpperCase()}${r.slice(1)} · ${hatsOf(r).length}`));
    expect(el().querySelector('td-tabs a.on')?.textContent).toContain('Common');
    expect(el().querySelector<HTMLElement>('td-tabs a.tab:nth-child(4)')?.style.getPropertyValue('--tab-color')).toBe('var(--td-rarity-legendary)');
    expect(el().querySelectorAll('td-hat-card')).toHaveLength(hatsOf('common').length);
    expect(el().querySelector('.total')?.textContent?.trim()).toBe(`${collectibles()} collectibles`);
  });

  it('shows one rarity per tab', async () => {
    const { el } = await open('/catalog/epic');
    const names = [...el().querySelectorAll('td-hat-card .name')].map((n) => n.textContent?.replace('Exclusive', '').trim());
    expect(names).toEqual(hatsOf('epic').map((h) => h.name));
  });

  it('puts the chosen horse colour in the address and on every horse', async () => {
    const { el, settle, router, harness } = await open('/catalog');
    [...el().querySelectorAll<HTMLElement>('td-chip-group .chip')].find((c) => c.textContent?.trim() === 'Black')!.click();
    await settle();
    expect(router().url).toBe('/catalog?horse=black');
    const horse = harness.fixture.debugElement.query(By.directive(Horse)).componentInstance as Horse;
    expect(horse.colors()).toEqual(paletteFor('black').colors);
  });

  it('keeps the chosen horse marked when it is clicked again', async () => {
    const { el, settle, router } = await open('/catalog?horse=grey');
    const grey = () => [...el().querySelectorAll<HTMLElement>('td-chip-group .chip')].find((c) => c.textContent?.trim() === 'Grey')!;
    grey().click();
    await settle();
    expect(router().url).toBe('/catalog?horse=grey');
    expect(grey().getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the horse colour when switching tabs', async () => {
    const { el, settle, router } = await open('/catalog/rare?horse=grey');
    [...el().querySelectorAll<HTMLElement>('td-tabs a.tab')].find((a) => a.textContent?.includes('Epic'))!.click();
    await settle();
    expect(router().url).toBe('/catalog/epic?horse=grey');
  });

  it('falls back to chestnut for a horse it does not know', async () => {
    const { harness } = await open('/catalog?horse=purple');
    const horse = harness.fixture.debugElement.query(By.directive(Horse)).componentInstance as Horse;
    expect(horse.colors()).toEqual(paletteFor('chestnut').colors);
  });

  it('shows not-found for a rarity that does not exist', async () => {
    const { el } = await open('/catalog/nope');
    expect(el().querySelector('td-not-found h2')?.textContent).toBe('Page not found');
  });

  it('has the breadcrumb and the roll odds', async () => {
    const { el } = await open('/catalog');
    expect(el().querySelector('td-crumbs .here')?.textContent?.trim()).toBe('Hat catalog');
    expect(el().querySelector('.odds')?.textContent).toContain('37 / 15 / 7 / 1');
  });
});
