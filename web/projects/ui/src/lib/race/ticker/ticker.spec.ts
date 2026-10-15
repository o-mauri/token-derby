import { TestBed } from '@angular/core/testing';
import { FRAME_CLOCK, type FrameClock } from '../track/auto-scroll';
import type { TickerCell } from '../logic/ticker';
import { Ticker } from './ticker';

const CELLS: TickerCell[] = [
  { kind: 'order', position: 1, horseName: 'Stormbringer', valueText: '4,280', isLeader: true },
  { kind: 'order', position: 2, horseName: 'Pegasus', valueText: '−365', isLeader: false },
  { kind: 'sectiongap' },
  { kind: 'achievement', item: { horseName: 'Embers', name: 'Stampede!', description: '10,000 tokens in a minute', xp: 50 } },
  { kind: 'sep' },
  { kind: 'label', text: 'Premier', groupClass: 'ticker-div-2' },
  { kind: 'groupsep' },
  { kind: 'standing', position: 1, horseName: 'Bolt', total: 30, gain: 20, isLeader: true },
];

function setup() {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock: FrameClock = { now: () => now, request: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; } };
  TestBed.configureTestingModule({ providers: [{ provide: FRAME_CLOCK, useValue: clock }] });
  const f = TestBed.createComponent(Ticker);
  const el = f.nativeElement as HTMLElement;
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 4000 });
  const frames = async (n: number, stepMs = 16) => {
    for (let i = 0; i < n; i++) { now += stepMs; const cb = pending; pending = null; cb?.(); await f.whenStable(); }
  };
  return { f, el, frames };
}

const text = (el: HTMLElement, sel: string) => [...el.querySelectorAll(sel)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

describe('Ticker', () => {
  // jsdom lays nothing out; give every rendered element a realistic width.
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!;
  beforeEach(() => Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 120 }));
  afterEach(() => Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original));

  it('is hidden while it has nothing to show', async () => {
    const { f, el, frames } = setup();
    f.componentRef.setInput('cells', []);
    await frames(3);
    expect(el.classList.contains('is-empty')).toBe(true);
  });

  it('renders every kind of cell in order', async () => {
    const { f, el, frames } = setup();
    f.componentRef.setInput('cells', CELLS);
    await frames(20);
    expect(el.classList.contains('is-empty')).toBe(false);
    expect(text(el, '.order').slice(0, 2)).toEqual(['1. Stormbringer 4,280', '2. Pegasus −365']);
    expect(el.querySelector('.order .val.lead')).not.toBeNull();
    expect(text(el, '.achievement')[0]).toBe('+50 XP Embers Stampede! 10,000 tokens in a minute');
    expect(el.querySelector('.label.ticker-div-2')?.textContent?.trim()).toBe('Premier');
    expect(text(el, '.standing')[0]).toBe('1. Bolt 30 (+20)');
    expect(el.querySelector('.seam')).not.toBeNull();
  });

  it('hides decorative separators from screen readers', async () => {
    const { f, el, frames } = setup();
    f.componentRef.setInput('cells', CELLS);
    await frames(20);
    for (const sel of ['.sep', '.groupsep', '.sectiongap', '.seam']) {
      expect(el.querySelector(sel)!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('scrolls left over time and holds still while hovered', async () => {
    const { f, el, frames } = setup();
    f.componentRef.setInput('cells', CELLS);
    await frames(20);
    const track = el.querySelector<HTMLElement>('.track')!;
    const before = track.style.transform;
    await frames(10);
    expect(track.style.transform).not.toBe(before);
    el.dispatchEvent(new Event('mouseenter'));
    const held = track.style.transform;
    await frames(10);
    expect(track.style.transform).toBe(held);
    el.dispatchEvent(new Event('mouseleave'));
    await frames(5);
    expect(track.style.transform).not.toBe(held);
  });
});
