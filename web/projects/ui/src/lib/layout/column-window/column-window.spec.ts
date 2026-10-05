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
    .map((c) => c.textContent!.trim());
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

  it('steps one column at a time and stops at the bottom division', async () => {
    const w = await render(FIVE);
    for (let i = 0; i < 4; i++) await w.click('.next');
    expect(w.visible()).toEqual(['League One', 'League Two', 'National']);
    expect(w.caption()).toBe('League One – National · 5 divisions');
    expect(w.el.querySelector<HTMLButtonElement>('.next')!.disabled).toBe(true);
    expect(w.el.querySelector<HTMLButtonElement>('.prev')!.disabled).toBe(false);
  });

  it('starts at the top division with the back arrow disabled', async () => {
    const w = await render(FIVE);
    expect(w.el.querySelector<HTMLButtonElement>('.prev')!.disabled).toBe(true);
    await w.click('.next');
    await w.click('.prev');
    expect(w.visible()).toEqual(['Premier', 'Championship', 'League One']);
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
    for (let i = 0; i < 2; i++) { el.querySelector<HTMLButtonElement>('.next')!.click(); await f.whenStable(); }
    f.componentRef.setInput('names', FIVE.slice(0, 4));
    await f.whenStable();
    expect(el.querySelector('.caption')!.textContent!.trim()).toBe('Championship – League Two · 4 divisions');
  });
});
