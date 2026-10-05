import { TestBed } from '@angular/core/testing';
import { RaceLane } from './lane';
import type { LaneState, LaneView } from '../models';

const LANE: LaneView = {
  id: 'h1', name: 'Thunderhoof', owner: 'omar',
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  hat: { id: 'stetson' }, tokens: 4200, level: 5, pace: 120, position: 2, league: null,
  stamina: { value: 64, band: 'high' },
};

async function render(opts: { lane?: Partial<LaneView>; progress?: number; state?: LaneState; index?: number; last?: boolean } = {}) {
  const f = TestBed.createComponent(RaceLane);
  f.componentRef.setInput('lane', { ...LANE, ...opts.lane });
  f.componentRef.setInput('progress', opts.progress ?? 40);
  f.componentRef.setInput('state', opts.state ?? 'live');
  f.componentRef.setInput('index', opts.index ?? 0);
  f.componentRef.setInput('last', opts.last ?? false);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

describe('RaceLane', () => {
  it('shows the horse chip with the lane values', async () => {
    const { el } = await render();
    expect(el.querySelector('td-horse-chip .name')?.textContent).toBe('Thunderhoof');
    expect(el.querySelector('td-horse-chip .tokens')?.textContent).toBe('4,200 tok');
    expect(el.querySelector('td-horse-chip .position')?.textContent).toBe('2nd');
  });

  it('places the horse at its progress along the strip, wearing its hat', async () => {
    const { el } = await render({ progress: 37.5 });
    const runner = el.querySelector('.strip .runner') as HTMLElement;
    expect(runner.style.left).toBe('37.5%');
    expect(runner.querySelector('td-horse .horse-hat-stetson')).not.toBeNull();
  });

  it('runs the gait while pending or live and stands still once finished', async () => {
    for (const [state, running] of [['pending', true], ['live', true], ['finished', false]] as const) {
      const { el } = await render({ state });
      expect(el.querySelector('td-horse')!.classList.contains('running')).toBe(running);
      expect(el.querySelector('.lane')!.classList.contains(state)).toBe(true);
    }
  });

  it('kicks up dust only while live', async () => {
    expect((await render({ state: 'live' })).el.querySelector('.horse-dust')).not.toBeNull();
    expect((await render({ state: 'pending' })).el.querySelector('.horse-dust')).toBeNull();
  });

  it('shows the stamina bar only when the race has stamina on', async () => {
    const on = await render();
    expect(on.el.querySelector('.runner td-stamina-bar')?.getAttribute('aria-valuenow')).toBe('64');
    const off = await render({ lane: { stamina: null } });
    expect(off.el.querySelector('td-stamina-bar')).toBeNull();
  });

  it('marks first and last lanes and picks one of five rain offsets for theme art', async () => {
    const first = await render({ index: 0 });
    expect(first.el.querySelector('.lane')!.classList.contains('first')).toBe(true);
    expect(first.el.querySelector('.rain')!.classList.contains('rain-v0')).toBe(true);
    const later = await render({ index: 7, last: true });
    const lane = later.el.querySelector('.lane')!;
    expect(lane.classList.contains('first')).toBe(false);
    expect(lane.classList.contains('last')).toBe(true);
    expect(later.el.querySelector('.rain')!.classList.contains('rain-v2')).toBe(true);
  });

  it("draws a fence above the first lane only, since every lane draws its fence at its foot", async () => {
    expect((await render({ index: 0 })).el.querySelector('.strip > .top-fence')).not.toBeNull();
    expect((await render({ index: 1 })).el.querySelector('.top-fence')).toBeNull();
  });
});
