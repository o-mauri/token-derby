import { TestBed } from '@angular/core/testing';
import { HorseHead, discTone } from './horse-head';

describe('discTone', () => {
  it('puts dark horses on a light disc and light horses on a dark one', () => {
    expect(discTone('#8B4513')).toBe('light');
    expect(discTone('#4A235A')).toBe('light');
    expect(discTone('#FFFFFF')).toBe('dark');
    expect(discTone('#CD853F')).toBe('dark');
  });

  it('reads three-digit hex', () => {
    expect(discTone('#000')).toBe('light');
    expect(discTone('#fff')).toBe('dark');
  });
});

describe('HorseHead', () => {
  async function render(colors: { body: string; mane: string }, hat: { id: string } | null = null) {
    const f = TestBed.createComponent(HorseHead);
    f.componentRef.setInput('colors', { ...colors, tail: colors.mane, saddle: '#333333' });
    f.componentRef.setInput('hat', hat);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  }

  it('draws the face in the horse colours on a disc chosen from the body', async () => {
    const el = await render({ body: '#8B4513', mane: '#000000' });
    expect(el.getAttribute('data-tone')).toBe('light');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('svg rect').length).toBeGreaterThan(30);
    expect(el.querySelector('g.horse-hat')).toBeNull();
  });

  it('adds the hat on top when the horse wears one', async () => {
    const el = await render({ body: '#FFFFFF', mane: '#000000' }, { id: 'cowboy_hat' });
    expect(el.getAttribute('data-tone')).toBe('dark');
    expect(el.querySelector('g.horse-hat')).not.toBeNull();
  });
});
