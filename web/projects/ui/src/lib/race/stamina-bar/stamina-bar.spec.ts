import { TestBed } from '@angular/core/testing';
import { StaminaBar } from './stamina-bar';
import type { StaminaBand } from '../models';

async function render(value: number, band: StaminaBand = 'high') {
  const f = TestBed.createComponent(StaminaBar);
  f.componentRef.setInput('value', value);
  f.componentRef.setInput('band', band);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  return { el, fill: el.querySelector('.fill') as HTMLElement };
}

describe('StaminaBar', () => {
  it('is a meter reporting the stamina value', async () => {
    const { el } = await render(64);
    expect(el.getAttribute('role')).toBe('meter');
    expect(el.getAttribute('aria-valuenow')).toBe('64');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('100');
    expect(el.getAttribute('aria-label')).toBe('Stamina');
  });

  it('fills in proportion, keeping a 2px sliver while alive and none when empty', async () => {
    expect((await render(100)).fill.style.width).toBe('38px');
    expect((await render(1)).fill.style.width).toBe('2px');
    expect((await render(0)).fill.style.width).toBe('0px');
  });

  it('carries its band as a class for the colour', async () => {
    const { el } = await render(10, 'low');
    expect(el.classList.contains('low')).toBe(true);
  });
});
