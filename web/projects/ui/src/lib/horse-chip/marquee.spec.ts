import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Marquee } from './marquee';

@Component({
  imports: [Marquee],
  template: `<div class="row" style="width:50px;overflow:hidden"><span [tdMarquee]="label()">{{ label() }}</span></div>`,
})
class Host { readonly label = signal('short'); }

describe('Marquee', () => {
  it('scrolls only when the content overflows its row, by exactly the overflow', async () => {
    const f = TestBed.createComponent(Host);
    const el = f.nativeElement as HTMLElement;
    const row = el.querySelector('.row') as HTMLElement;
    const span = () => el.querySelector('.row > span') as HTMLElement;
    Object.defineProperty(row, 'clientWidth', { configurable: true, get: () => 50 });
    await f.whenStable();
    Object.defineProperty(span(), 'scrollWidth', { configurable: true, get: () => (f.componentInstance.label() === 'short' ? 30 : 80) });
    f.componentInstance.label.set('short ');
    await f.whenStable();
    f.componentInstance.label.set('short');
    await f.whenStable();
    expect(span().classList.contains('scrolling')).toBe(false);

    f.componentInstance.label.set('a much longer horse name');
    await f.whenStable();
    expect(span().classList.contains('scrolling')).toBe(true);
    expect(span().style.getPropertyValue('--shift')).toBe('-30px');
  });
});
