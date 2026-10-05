import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { Segmented } from './segmented';

const MODES = [{ value: 'schedule', label: 'Schedule' }, { value: 'league', label: 'League' }, { value: 'off', label: 'Off' }];

async function render(extra: Record<string, unknown> = {}) {
  const f = TestBed.createComponent(Segmented<string>);
  for (const [k, v] of Object.entries({ label: 'Racing', options: MODES, value: 'schedule', ...extra })) f.componentRef.setInput(k, v);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  return { f, el, opts: [...el.querySelectorAll<HTMLElement>('[role="option"]')] };
}

describe('Segmented', () => {
  it('is a single-select listbox with the current value selected', async () => {
    const { el, opts } = await render();
    expect(el.querySelector('[role="listbox"]')!.getAttribute('aria-multiselectable')).toBe('false');
    expect(opts[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('replaces the value on click, and clicking the selected one keeps it', async () => {
    const { f, opts } = await render();
    opts[1]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toBe('league');
    opts[1]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toBe('league');
    expect(opts[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('ignores clicks when disabled', async () => {
    const { f, opts } = await render({ disabled: true });
    opts[2]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toBe('schedule');
  });
});

@Component({ imports: [Segmented, FormField], template: `<td-segmented label="Racing" [options]="modes" [formField]="f.mode" />` })
class Host { modes = MODES; model = signal({ mode: 'off' }); f = form(this.model); }

describe('Segmented in a Signal Form', () => {
  it('binds a single-value field', async () => {
    const fx = TestBed.createComponent(Host);
    await fx.whenStable();
    const opts = [...(fx.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[role="option"]')];
    opts[0]!.click();
    await fx.whenStable();
    expect(fx.componentInstance.model().mode).toBe('schedule');
  });
});
