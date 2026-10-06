import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEUTRAL_HORSE } from '../models';
import { YouCard } from './you-card';
import { HorseHead } from '../../horse-head/horse-head';
import { By } from '@angular/platform-browser';

async function render(link: unknown[] | null) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(YouCard);
  f.componentRef.setInput('name', 'Omar');
  f.componentRef.setInput('link', link);
  await f.whenStable();
  return f;
}

describe('YouCard', () => {
  it('links to your page with your name', async () => {
    const el = (await render(['/me'])).nativeElement as HTMLElement;
    const a = el.querySelector('a.card');
    expect(a?.getAttribute('href')).toBe('/me');
    expect(a?.textContent).toContain('Omar');
    expect(a?.textContent).toContain('›');
  });

  it('is greyed and not a link until your page exists', async () => {
    const el = (await render(null)).nativeElement as HTMLElement;
    expect(el.querySelector('a')).toBeNull();
    const card = el.querySelector('div.card.disabled');
    expect(card?.getAttribute('aria-disabled')).toBe('true');
    expect(card?.textContent).toContain('Coming soon');
  });

  it('shows the neutral horse when it has no colours', async () => {
    const f = await render(null);
    const head = f.debugElement.query(By.directive(HorseHead)).componentInstance as HorseHead;
    expect(head.colors()).toEqual(NEUTRAL_HORSE);
  });
});
