import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { ChipGroup } from './chip-group';

const DAYS = [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' }];

async function render(extra: Record<string, unknown> = {}) {
  const f = TestBed.createComponent(ChipGroup<number>);
  for (const [k, v] of Object.entries({ label: 'Race days', options: DAYS, ...extra })) f.componentRef.setInput(k, v);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  return { f, el, chips: [...el.querySelectorAll<HTMLElement>('[role="option"]')] };
}

describe('ChipGroup', () => {
  it('renders a labelled multi-select listbox of chips', async () => {
    const { el, chips } = await render();
    const box = el.querySelector('[role="listbox"]')!;
    expect(box.getAttribute('aria-multiselectable')).toBe('true');
    expect(box.getAttribute('aria-labelledby')).toBe(el.querySelector('.label')!.id);
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Mon', 'Tue', 'Wed']);
  });

  it('toggles membership on click', async () => {
    const { f, chips } = await render({ value: [2] });
    chips[0]!.click();
    await f.whenStable();
    expect([...f.componentInstance.value()].sort()).toEqual([1, 2]);
    chips[1]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual([1]);
    expect(chips[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('ignores clicks when disabled', async () => {
    const { f, chips } = await render({ disabled: true });
    chips[0]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual([]);
  });
});

@Component({ imports: [ChipGroup, FormField], template: `<td-chip-group label="Days" [options]="days" [formField]="f.days" />` })
class Host { days = DAYS; model = signal({ days: [3] as number[] }); f = form(this.model); }

describe('ChipGroup in a Signal Form', () => {
  it('binds an array field', async () => {
    const fx = TestBed.createComponent(Host);
    await fx.whenStable();
    const chips = [...(fx.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]')];
    expect(chips[2]!.getAttribute('aria-selected')).toBe('true');
    chips[0]!.click();
    await fx.whenStable();
    expect([...fx.componentInstance.model().days].sort()).toEqual([1, 3]);
  });

  it('can pick just one, and never ends up with none picked', async () => {
    const { f, el, chips } = await render({ value: [2], single: true });
    expect(el.querySelector('[role="listbox"]')!.getAttribute('aria-multiselectable')).toBe('false');
    chips[0]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual([1]);
    chips[0]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toEqual([1]);
    expect(chips[0]!.getAttribute('aria-selected')).toBe('true');
  });
});
