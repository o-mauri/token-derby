import { TestBed } from '@angular/core/testing';
import { HorseCard } from './horse-card';
import type { LaneView } from '../models';

const lane = (id: string, position: number, tokens: number, extra: Partial<LaneView> = {}): LaneView => ({
  id, name: `Horse ${id}`, owner: 'sam', colors: { body: '#ecebe6', mane: '#1a1a1a', tail: '#1a1a1a', saddle: '#2350b5' },
  hat: null, tokens, level: 12, pace: 1840, position, league: null, stamina: null, ...extra,
});

const FIELD = [lane('a', 1, 513_383), lane('b', 2, 474_922), lane('c', 3, 437_267), lane('d', 4, 411_166)];

async function render(id: string, field = FIELD) {
  const f = TestBed.createComponent(HorseCard);
  f.componentRef.setInput('lane', field.find((l) => l.id === id)!);
  f.componentRef.setInput('field', field);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();
const all = (el: HTMLElement, sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim());

describe('HorseCard', () => {
  it('shows who the horse is, its place and its tokens', async () => {
    const el = await render('c');
    expect(text(el, '.name')).toBe('Horse c');
    expect(text(el, '.level')).toBe('LV 12');
    expect(text(el, '.owner')).toBe('ridden by sam');
    expect(text(el, '.rosette')).toBe('3RD');
    expect(el.querySelector('.rosette')!.classList).toContain('bronze');
    expect(text(el, '.tokens')).toBe('437,267 tok');
    expect(text(el, '.pace')).toBe('▲ 1,840/min');
  });

  it('wears the horse\'s colours in the header', async () => {
    const el = await render('c');
    const silks = el.querySelector<HTMLElement>('.silks')!;
    expect(silks.style.getPropertyValue('--silk')).toBe('#2350b5');
    expect(silks.style.getPropertyValue('--silk-edge')).toBe('#ecebe6');
  });

  it('gives a plain rosette below the medals', async () => {
    const el = await render('d');
    expect(el.querySelector('.rosette')!.classList).toContain('place');
  });

  it('shows the gaps to the horse ahead and the leader, behind to ahead', async () => {
    const el = await render('c');
    expect(all(el, '.slot .value')).toEqual(['3RD', '−37.7k', '−76.1k']);
    expect(all(el, '.slot .label')).toEqual(['YOU', 'TO 2ND', 'TO 1ST']);
    expect(all(el, '.runners span')).toEqual(['Horse c', 'Horse b', 'Horse a']);
    const marks = [...el.querySelectorAll<HTMLElement>('.lane-track .mark')];
    // Horse b is 37,655 of c's 76,116 gap to a: 10 + 80 × 0.495.
    expect(marks.map((m) => parseFloat(m.style.left))).toEqual([10, expect.closeTo(49.58, 1), 90]);
    expect(marks.map((m) => m.classList.contains('you'))).toEqual([true, false, false]);
  });

  it('shows the leader its lead over the two horses behind', async () => {
    const el = await render('a');
    expect(all(el, '.slot .label')).toEqual(['3RD', '2ND', 'YOU']);
    expect(all(el, '.slot .value')).toEqual(['+76.1k', '+38.5k', '1ST']);
    expect(el.querySelectorAll('.slot.behind').length).toBe(2);
  });

  it('leaves out the gap track when racing alone', async () => {
    const el = await render('a', FIELD.slice(0, 1));
    expect(el.querySelector('.chase')).toBeNull();
  });

  it('leaves out pace, stamina, league and owner when the race has none', async () => {
    const el = await render('c', FIELD.map((l) => (l.id === 'c' ? { ...l, pace: null, owner: '' } : l)));
    expect(el.querySelector('.pace')).toBeNull();
    expect(el.querySelector('.stamina')).toBeNull();
    expect(el.querySelector('.league')).toBeNull();
    expect(el.querySelector('.owner')).toBeNull();
  });

  it('shows stamina as ten blocks in its band colour', async () => {
    const el = await render('c', FIELD.map((l) => (l.id === 'c' ? { ...l, stamina: { value: 82, band: 'high' as const } } : l)));
    expect(el.querySelectorAll('.blocks .on').length).toBe(8);
    expect(el.querySelectorAll('.blocks i').length).toBe(10);
    expect(el.querySelector('.stamina')!.classList).toContain('high');
    expect(text(el, '.stamina .pct')).toBe('82%');
  });

  it('shows the league standing in league races', async () => {
    const el = await render('c', FIELD.map((l) => (l.id === 'c' ? { ...l, league: { rank: 2, division: 'Division 1' } } : l)));
    expect(all(el, '.league span')).toEqual(['LEAGUE', '2nd in Division 1']);
  });
});
