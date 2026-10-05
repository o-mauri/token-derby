import { TestBed } from '@angular/core/testing';
import { NotFound, type NotFoundMessagePart } from './not-found';
import { BUBBLE_ROWS } from './bubble';

async function render(message: NotFoundMessagePart[]) {
  const f = TestBed.createComponent(NotFound);
  f.componentRef.setInput('title', 'Race not found');
  f.componentRef.setInput('message', message);
  f.componentRef.setInput('backLabel', '← Home');
  await f.whenStable();
  return f;
}

describe('NotFound', () => {
  it('renders title, message parts in order, and the back link', async () => {
    const el = (await render(['No race called ', { strong: 'ABC123' }, '.'])).nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.querySelector('h2')?.textContent).toBe('Race not found');
    const p = el.querySelector('p')!;
    expect(p.textContent).toBe('No race called ABC123.');
    expect(p.querySelector('strong')?.textContent).toBe('ABC123');
    const btn = el.querySelector('button')!;
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.textContent?.trim()).toBe('← Home');
    expect(el.querySelector('a')).toBeNull();
  });

  it('emits back when the button is clicked, leaving navigation to the page', async () => {
    const f = await render(['x']);
    let emitted = 0;
    f.componentInstance.back.subscribe(() => emitted++);
    (f.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(emitted).toBe(1);
  });

  it('renders a typed value as text, never as markup', async () => {
    const typed = '<img src=x onerror=alert(1)>';
    const el = (await render(['No org called ', { strong: typed }])).nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('strong')?.textContent).toBe(typed);
  });

  it('draws the thought bubble from its pixel rows', async () => {
    const el = (await render(['x'])).nativeElement as HTMLElement;
    const svg = el.querySelector('svg.not-found-bubble')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 214 214');
    const filled = BUBBLE_ROWS.join('').replace(/\./g, '').length;
    expect(svg.querySelectorAll('rect').length).toBe(filled);
  });
});
