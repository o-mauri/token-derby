import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { Select } from './select';

const LEAGUES = [{ value: 'spring', label: 'Spring cup' }, { value: 'summer', label: 'Summer derby' }, { value: 'autumn', label: 'Autumn stakes' }];

async function render(extra: Record<string, unknown> = {}) {
  const f = TestBed.createComponent(Select<string>);
  for (const [k, v] of Object.entries({ label: 'League', options: LEAGUES, value: 'summer', ...extra })) f.componentRef.setInput(k, v);
  await f.whenStable();
  const trigger = (f.nativeElement as HTMLElement).querySelector('button')!;
  return { f, trigger };
}

const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

describe('Select', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows the selected label on a labelled, collapsed trigger', async () => {
    const { f, trigger } = await render();
    expect(trigger.textContent).toContain('Summer derby');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-labelledby')).toContain((f.nativeElement as HTMLElement).querySelector('.label')!.id);
    expect(listbox()).toBeNull();
  });

  it('shows the placeholder when nothing is selected', async () => {
    const { trigger } = await render({ value: null, placeholder: 'Pick a league' });
    expect(trigger.textContent).toContain('Pick a league');
  });

  it('opens on click, selects an option, closes and refocuses the trigger', async () => {
    const { f, trigger } = await render();
    trigger.click();
    await f.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Spring cup', 'Summer derby', 'Autumn stakes']);
    expect(options()[1]!.getAttribute('aria-selected')).toBe('true');
    options()[2]!.click();
    await f.whenStable();
    expect(f.componentInstance.value()).toBe('autumn');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens from the keyboard with ArrowDown', async () => {
    const { f, trigger } = await render();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await f.whenStable();
    expect(listbox()).not.toBeNull();
  });

  it('closes on Escape without changing the value', async () => {
    const { f, trigger } = await render();
    trigger.click();
    await f.whenStable();
    listbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await f.whenStable();
    expect(listbox()).toBeNull();
    expect(f.componentInstance.value()).toBe('summer');
    expect(document.activeElement).toBe(trigger);
  });

  it('does not open when disabled', async () => {
    const { f, trigger } = await render({ disabled: true });
    trigger.click();
    await f.whenStable();
    expect(trigger.disabled).toBe(true);
    expect(listbox()).toBeNull();
  });
});

@Component({ imports: [Select, FormField], template: `<td-select label="League" [options]="leagues" [formField]="f.league" />` })
class Host { leagues = LEAGUES; readonly model = signal({ league: 'spring' }); f = form(this.model); }

describe('Select in a Signal Form', () => {
  it('binds the field', async () => {
    const fx = TestBed.createComponent(Host);
    await fx.whenStable();
    const trigger = (fx.nativeElement as HTMLElement).querySelector('button')!;
    expect(trigger.textContent).toContain('Spring cup');
    trigger.click();
    await fx.whenStable();
    options()[1]!.click();
    await fx.whenStable();
    expect(fx.componentInstance.model().league).toBe('summer');
  });

  it('can hide its label visually while keeping it for screen readers', async () => {
    const { f } = await render({ hideLabel: true });
    const label = (f.nativeElement as HTMLElement).querySelector('.label')!;
    expect(label.classList.contains('sr-only')).toBe(true);
    expect(label.textContent).toBe('League');
  });

  it('is always as wide as its longest option, whichever is picked', async () => {
    const f = TestBed.createComponent(Select<string>);
    f.componentRef.setInput('label', 'Theme');
    f.componentRef.setInput('options', [{ value: 'a', label: 'Derby' }, { value: 'b', label: 'Chromatic Circuit' }]);
    f.componentRef.setInput('value', 'a');
    await f.whenStable();
    const sizer = (f.nativeElement as HTMLElement).querySelector('.trigger .sizer')!;
    expect(sizer.getAttribute('aria-hidden')).toBe('true');
    expect([...sizer.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['Derby', 'Chromatic Circuit']);
  });
});
