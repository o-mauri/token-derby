import { TestBed } from '@angular/core/testing';
import { MODIFIERS, type ModifierSetting } from '@token-derby/shared';
import { ModifierCard } from './modifier-card';

async function render(value: ModifierSetting | undefined) {
  const f = TestBed.createComponent(ModifierCard);
  f.componentRef.setInput('modifier', MODIFIERS.stamina);
  f.componentRef.setInput('value', value);
  const emitted: ModifierSetting[] = [];
  f.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement, emitted };
}

const paramCount = Object.keys(MODIFIERS.stamina.params).length;

describe('ModifierCard', () => {
  it('names the modifier and hides its tuning while off', async () => {
    const { el } = await render(undefined);
    expect(el.textContent).toContain('Stamina');
    expect(el.textContent).toContain(MODIFIERS.stamina.description);
    expect(el.querySelectorAll('td-slider')).toHaveLength(0);
  });

  it('turns on with the default tuning and shows a slider per setting', async () => {
    const { f, el, emitted } = await render(undefined);
    el.querySelector<HTMLElement>('td-toggle button, td-toggle input')!.click();
    await f.whenStable();
    const defaults = Object.fromEntries(Object.entries(MODIFIERS.stamina.params).map(([k, b]) => [k, b.default]));
    expect(emitted.at(-1)).toEqual({ enabled: true, params: defaults });
  });

  it('shows the tuning and what it means while on', async () => {
    const { el } = await render({ enabled: true });
    expect(el.querySelectorAll('td-slider')).toHaveLength(paramCount);
    expect(el.querySelectorAll('.readout li').length).toBeGreaterThan(0);
  });

  it('emits a moved slider', async () => {
    const { f, emitted } = await render({ enabled: true });
    const key = Object.keys(MODIFIERS.stamina.params)[0]!;
    f.componentInstance['setParam'](key, 123);
    await f.whenStable();
    expect(emitted.at(-1)?.params?.[key]).toBe(123);
  });
});
