import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, required } from '@angular/forms/signals';
import { TextInput } from './text-input';

async function render(setup: (f: ReturnType<typeof TestBed.createComponent<TextInput>>) => void = () => {}) {
  const f = TestBed.createComponent(TextInput);
  f.componentRef.setInput('label', 'Webhook URL');
  setup(f);
  await f.whenStable();
  const input = (f.nativeElement as HTMLElement).querySelector('input')!;
  return { f, input };
}

function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event('input'));
}

describe('TextInput', () => {
  it('labels the input and updates value as the user types', async () => {
    const { f, input } = await render();
    const label = (f.nativeElement as HTMLElement).querySelector('label')!;
    expect(label.textContent?.trim()).toBe('Webhook URL');
    expect(label.getAttribute('for')).toBe(input.id);
    type(input, 'https://hooks.example');
    expect(f.componentInstance.value()).toBe('https://hooks.example');
  });

  it('parses numbers, and turns empty or invalid text into null rather than NaN', async () => {
    const { f, input } = await render((f) => f.componentRef.setInput('type', 'number'));
    type(input, '42');
    expect(f.componentInstance.value()).toBe(42);
    type(input, '');
    expect(f.componentInstance.value()).toBeNull();
    type(input, 'abc');
    expect(f.componentInstance.value()).toBeNull();
  });

  it('disables the native input', async () => {
    const { input } = await render((f) => f.componentRef.setInput('disabled', true));
    expect(input.disabled).toBe(true);
  });

  it('emits touch on blur', async () => {
    const { f, input } = await render();
    let touched = 0;
    f.componentInstance.touch.subscribe(() => touched++);
    input.dispatchEvent(new Event('blur'));
    expect(touched).toBe(1);
  });
});

@Component({
  imports: [TextInput, FormField],
  template: `<td-text-input label="Name" [formField]="f.name" />`,
})
class FormHost {
  model = signal({ name: '' });
  f = form(this.model, (p) => required(p.name, { message: 'Name is required' }));
}

describe('TextInput in a Signal Form', () => {
  it('binds the field and shows errors only once touched', async () => {
    const fx = TestBed.createComponent(FormHost);
    await fx.whenStable();
    const el = fx.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    expect(el.querySelector('.error')).toBeNull();
    input.dispatchEvent(new Event('blur'));
    await fx.whenStable();
    expect(el.querySelector('.error')?.textContent?.trim()).toBe('Name is required');
    type(input, 'Acme');
    await fx.whenStable();
    expect(fx.componentInstance.model().name).toBe('Acme');
    expect(el.querySelector('.error')).toBeNull();
  });

  it('takes a time and keeps it as text', async () => {
    const f = TestBed.createComponent(TextInput);
    f.componentRef.setInput('type', 'time');
    await f.whenStable();
    const box = (f.nativeElement as HTMLElement).querySelector('input')!;
    expect(box.type).toBe('time');
    box.value = '09:30';
    box.dispatchEvent(new Event('input'));
    expect(f.componentInstance.value()).toBe('09:30');
  });

  it('can keep its label for screen readers only', async () => {
    const f = TestBed.createComponent(TextInput);
    f.componentRef.setInput('label', 'Division 1 name');
    f.componentRef.setInput('hideLabel', true);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelector('label')?.classList.contains('sr-only')).toBe(true);
  });
});
