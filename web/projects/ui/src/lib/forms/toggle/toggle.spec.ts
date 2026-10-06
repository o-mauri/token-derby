import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { Toggle } from './toggle';

async function render(disabled = false) {
  const f = TestBed.createComponent(Toggle);
  f.componentRef.setInput('label', 'Stamina');
  f.componentRef.setInput('disabled', disabled);
  await f.whenStable();
  return { f, sw: (f.nativeElement as HTMLElement).querySelector('button')! };
}

describe('Toggle', () => {
  it('is a labelled switch that flips on click', async () => {
    const { f, sw } = await render();
    expect(sw.getAttribute('role')).toBe('switch');
    expect(sw.getAttribute('type')).toBe('button');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.getAttribute('aria-labelledby')).toBeTruthy();
    sw.click();
    await f.whenStable();
    expect(f.componentInstance.checked()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('ignores clicks when disabled', async () => {
    const { f, sw } = await render(true);
    sw.click();
    expect(f.componentInstance.checked()).toBe(false);
    expect(sw.disabled).toBe(true);
  });
});

@Component({ imports: [Toggle, FormField], template: `<td-toggle label="On" [formField]="f.on" />` })
class Host { readonly model = signal({ on: true }); f = form(this.model); }

describe('Toggle in a Signal Form', () => {
  it('binds a boolean field both ways', async () => {
    const fx = TestBed.createComponent(Host);
    await fx.whenStable();
    const sw = (fx.nativeElement as HTMLElement).querySelector('button')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    sw.click();
    await fx.whenStable();
    expect(fx.componentInstance.model().on).toBe(false);
  });
});
