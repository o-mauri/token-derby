import { TestBed } from '@angular/core/testing';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';
import { lineColor } from '../logic/chart';
import { RaceChart } from './race-chart';

const horse = (id: string, name: string, rank: number) =>
  ({ horse_id: id, name, rank, colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' } } as HorseView);
const SERIES: GetRaceSeriesResponse = {
  start_ms: 0, end_ms: 600_000,
  horses: [
    { horse_id: 'a', points: [{ t: 60_000, d: 40 }, { t: 120_000, d: 60 }] },
    { horse_id: 'b', points: [{ t: 60_000, d: 10 }, { t: 120_000, d: 20 }] },
  ],
};
const HORSES = [horse('b', 'Beta', 2), horse('a', 'Alpha', 1)];

class FakeRO {
  static last: FakeRO;
  constructor(private readonly cb: ResizeObserverCallback) { FakeRO.last = this; }
  observe() {} disconnect() {}
  size(width: number, height: number) { this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as never); }
}

async function render(mode: 'cumulative' | 'throughput', series = SERIES) {
  TestBed.configureTestingModule({ providers: [{ provide: RESIZE_OBSERVER, useValue: FakeRO }] });
  const f = TestBed.createComponent(RaceChart);
  f.componentRef.setInput('mode', mode);
  f.componentRef.setInput('series', series);
  f.componentRef.setInput('horses', HORSES);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('RaceChart', () => {
  it('titles the cumulative chart with what it measures', async () => {
    expect((await render('cumulative')).el.querySelector('.title')?.textContent).toBe('Cumulative scored tokens');
  });

  it('titles the pace chart with what it measures, drawn as polylines', async () => {
    const el = (await render('throughput')).el;
    expect(el.querySelector('.title')?.textContent).toBe('Tokens produced / min (30-min avg)');
    expect(el.querySelectorAll('svg polyline.line').length).toBe(2);
  });

  it('draws one line per horse (smooth paths for cumulative, polylines for pace) and a legend in rank order', async () => {
    const cum = (await render('cumulative')).el;
    expect(cum.querySelectorAll('svg path.line').length).toBe(2);
    expect([...cum.querySelectorAll('.legend .item')].map((i) => i.textContent?.trim())).toEqual(['Alpha', 'Beta']);
    expect(cum.querySelector<HTMLElement>('.legend .chip')!.style.background).toBe(lineColor(0));
  });

  it('draws at 600 wide until laid out, then follows its box', async () => {
    const { f, el } = await render('cumulative');
    expect(el.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 600 300');
    FakeRO.last.size(1200, 300);
    await f.whenStable();
    expect(el.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1200 300');
  });

  it('says so when there is no token data yet', async () => {
    const { el } = await render('cumulative', { start_ms: 0, end_ms: 1, horses: [{ horse_id: 'a', points: [] }] });
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('.empty')?.textContent?.trim()).toBe('No token data yet. Check back in a minute.');
  });

  it('labels the chart for screen readers', async () => {
    const { el } = await render('cumulative');
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Cumulative scored tokens for 2 horses');
  });

  describe('picking out one horse', () => {
    const lineFor = (el: HTMLElement, id: string) => el.querySelector(`.series[data-id="${id}"]`)!;
    const legendFor = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLElement>('.legend .item')].find((i) => i.textContent?.trim() === name)!;

    it('hovering a line highlights its legend item and mutes the other lines', async () => {
      const { f, el } = await render('cumulative');
      lineFor(el, 'b').querySelector('.hit')!.dispatchEvent(new Event('pointerenter'));
      await f.whenStable();
      expect(legendFor(el, 'Beta').classList.contains('active')).toBe(true);
      expect(legendFor(el, 'Alpha').classList.contains('dim')).toBe(true);
      expect(lineFor(el, 'b').classList.contains('active')).toBe(true);
      expect(lineFor(el, 'a').classList.contains('muted')).toBe(true);
      lineFor(el, 'b').querySelector('.hit')!.dispatchEvent(new Event('pointerleave'));
      await f.whenStable();
      expect(el.querySelectorAll('.series.muted').length).toBe(0);
    });

    it('draws the picked-out line on top of the others', async () => {
      const { f, el } = await render('cumulative');
      lineFor(el, 'b').querySelector('.hit')!.dispatchEvent(new Event('pointerenter'));
      await f.whenStable();
      expect([...el.querySelectorAll('.series')].at(-1)!.getAttribute('data-id')).toBe('b');
    });

    it('hovering or focusing a legend item picks out its line', async () => {
      const { f, el } = await render('cumulative');
      legendFor(el, 'Alpha').dispatchEvent(new Event('mouseenter'));
      await f.whenStable();
      expect(lineFor(el, 'b').classList.contains('muted')).toBe(true);
      legendFor(el, 'Alpha').dispatchEvent(new Event('mouseleave'));
      legendFor(el, 'Beta').dispatchEvent(new Event('focus'));
      await f.whenStable();
      expect(lineFor(el, 'a').classList.contains('muted')).toBe(true);
      expect(legendFor(el, 'Beta').tagName).toBe('BUTTON');
    });

    it('a tap on a line picks it out, and a second tap clears it', async () => {
      const { f, el } = await render('cumulative');
      const hit = lineFor(el, 'a').querySelector('.hit')!;
      hit.dispatchEvent(new Event('click'));
      await f.whenStable();
      expect(lineFor(el, 'b').classList.contains('muted')).toBe(true);
      hit.dispatchEvent(new Event('click'));
      await f.whenStable();
      expect(el.querySelectorAll('.series.muted').length).toBe(0);
    });
  });
});

