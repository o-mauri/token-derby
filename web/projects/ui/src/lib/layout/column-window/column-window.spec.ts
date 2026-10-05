import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColumnTemplate, ColumnWindow } from './column-window';

const FIVE = ['Premier', 'Championship', 'League One', 'League Two', 'National'];

@Component({
  imports: [ColumnWindow, ColumnTemplate],
  template: `
    <td-column-window label="divisions">
      @for (n of names(); track n) { <ng-template tdColumn [header]="n"><p class="col">{{ n }}</p></ng-template> }
    </td-column-window>`,
})
class Host { readonly names = input<string[]>(FIVE); }

async function render(names: string[]) {
  const f = TestBed.createComponent(Host);
  f.componentRef.setInput('names', names);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const visible = () => [...el.querySelectorAll<HTMLElement>('.column:not(.out)')]
    .sort((a, b) => Number(a.style.getPropertyValue('--slot')) - Number(b.style.getPropertyValue('--slot'))).map((c) => c.textContent!.trim());
  const click = async (sel: string) => { el.querySelector<HTMLButtonElement>(sel)!.click(); await f.whenStable(); };
  return { el, visible, click, caption: () => el.querySelector('.caption')?.textContent?.trim() ?? null };
}

describe('ColumnWindow', () => {
  it('shows every column, with no arrows or caption, when they fit', async () => {
    const w = await render(['Premier', 'Championship']);
    expect(w.visible()).toEqual(['Premier', 'Championship']);
    expect(w.el.querySelector('.prev')).toBeNull();
    expect(w.caption()).toBeNull();
  });

  it('shows the first three of five and names the window', async () => {
    const w = await render(FIVE);
    expect(w.visible()).toEqual(['Premier', 'Championship', 'League One']);
    expect(w.el.querySelectorAll('.column.out')).toHaveLength(2);
    expect(w.caption()).toBe('Premier – League One · 5 divisions');
  });

  it('steps one column at a time and wraps past the end', async () => {
    const w = await render(FIVE);
    for (let i = 0; i < 3; i++) await w.click('.next');
    expect(w.visible()).toEqual(['League Two', 'National', 'Premier']);
    expect(w.caption()).toBe('League Two – Premier · 5 divisions');
  });

  it('wraps backwards from the start', async () => {
    const w = await render(FIVE);
    await w.click('.prev');
    expect(w.visible()).toEqual(['National', 'Premier', 'Championship']);
  });

  it('labels the arrows for screen readers', async () => {
    const w = await render(FIVE);
    expect(w.el.querySelector('.prev')!.getAttribute('aria-label')).toBe('Show earlier divisions');
    expect(w.el.querySelector('.next')!.getAttribute('aria-label')).toBe('Show later divisions');
  });

  it('stays in range when columns are removed after stepping', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    for (let i = 0; i < 4; i++) { el.querySelector<HTMLButtonElement>('.next')!.click(); await f.whenStable(); }
    f.componentRef.setInput('names', FIVE.slice(0, 4));
    await f.whenStable();
    expect(el.querySelector('.caption')!.textContent!.trim()).toBe('Premier – League One · 4 divisions');
  });

  it('sets no window order on the columns themselves, so a stacked layout keeps their natural order', async () => {
    const w = await render(FIVE);
    await w.click('.next');
    expect([...w.el.querySelectorAll<HTMLElement>('.column')].every((c) => c.style.order === '')).toBe(true);
  });
});
