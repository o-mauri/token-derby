import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, max, min } from '@angular/forms/signals';
import { Slider } from './slider';

async function render(extra: Record<string, unknown> = {}) {
  const f = TestBed.createComponent(Slider);
  const inputs = { label: 'Drain rate', min: 0, max: 10, step: 0.5, value: 4, ...extra };
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  return { f, el, range: el.querySelector('input[type="range"]') as HTMLInputElement };
}

describe('Slider', () => {
  it('is a labelled native range with the bounds applied', async () => {
    const { el, range } = await render();
    expect(el.querySelector('label')?.getAttribute('for')).toBe(range.id);
    expect([range.min, range.max, range.step, range.value]).toEqual(['0', '10', '0.5', '4']);
  });

  it('updates value from the range input as a number', async () => {
    const { f, range } = await render();
    range.value = '7.5';
    range.dispatchEvent(new Event('input'));
    expect(f.componentInstance.value()).toBe(7.5);
  });

  it('steps with the arrow keys and clamps at the bounds', async () => {
    const { f, range } = await render({ value: 9.5 });
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(f.componentInstance.value()).toBe(10);
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(f.componentInstance.value()).toBe(10);
    f.componentRef.setInput('value', 0.5);
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(f.componentInstance.value()).toBe(0);
  });

  it('shows a formatted readout and the default', async () => {
    const { el, f } = await render({ format: (n: number) => `${n}/beat`, defaultValue: 5 });
    expect(el.querySelector('.readout')?.textContent).toContain('4/beat');
    expect(el.querySelector('.readout')?.textContent).toContain('(default 5/beat)');
    const marker = el.querySelector('.default-marker') as HTMLElement;
    expect(marker.style.left).toBe('50%');
    f.componentRef.setInput('defaultValue', undefined);
    await f.whenStable();
    expect(el.querySelector('.default-marker')).toBeNull();
  });

  it('exposes the fill fraction for the themed track and respects disabled', async () => {
    const { el, f, range } = await render({ disabled: true });
    expect((el as HTMLElement).style.getPropertyValue('--fill')).toBe('40%');
    expect(range.disabled).toBe(true);
    range.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(f.componentInstance.value()).toBe(4);
  });
});

@Component({ imports: [Slider, FormField], template: `<td-slider label="Rate" [formField]="f.rate" />` })
class RuleHost { model = signal({ rate: 3 }); f = form(this.model, (p) => { min(p.rate, 1); max(p.rate, 5); }); }

describe('Slider in a Signal Form', () => {
  it('takes its bounds from the form schema', async () => {
    const fx = TestBed.createComponent(RuleHost);
    await fx.whenStable();
    const range = (fx.nativeElement as HTMLElement).querySelector('input')!;
    expect([range.min, range.max]).toEqual(['1', '5']);
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    await fx.whenStable();
    expect(fx.componentInstance.model().rate).toBe(4);
  });
});
