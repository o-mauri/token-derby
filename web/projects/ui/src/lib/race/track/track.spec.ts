import { TestBed } from '@angular/core/testing';
import { RaceTrack } from './track';
import type { LaneView } from '../models';

const lane = (id: string, position: number): LaneView => ({
  id, name: `Horse ${id}`, owner: 'o', colors: { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' },
  hat: null, tokens: 100 * position, level: 1, pace: null, position, league: null, stamina: null,
});

async function render(lanes: LaneView[], progressById: Record<string, number>) {
  const f = TestBed.createComponent(RaceTrack);
  f.componentRef.setInput('lanes', lanes);
  f.componentRef.setInput('progressById', progressById);
  f.componentRef.setInput('state', 'live');
  await f.whenStable();
  return f;
}

const names = (el: HTMLElement) => [...el.querySelectorAll('td-race-lane td-horse-chip .name')].map((n) => n.textContent);

describe('RaceTrack', () => {
  it('renders a lane per horse in the given order, each at its own progress', async () => {
    const f = await render([lane('a', 1), lane('b', 2)], { a: 60, b: 30 });
    const el = f.nativeElement as HTMLElement;
    expect(names(el)).toEqual(['Horse a', 'Horse b']);
    const lefts = [...el.querySelectorAll<HTMLElement>('.runner')].map((r) => r.style.left);
    expect(lefts).toEqual(['60%', '30%']);
  });

  it('keeps each lane element when the order changes, so overtakes slide instead of re-rendering', async () => {
    const f = await render([lane('a', 1), lane('b', 2)], { a: 60, b: 30 });
    const el = f.nativeElement as HTMLElement;
    const [laneA, laneB] = [...el.querySelectorAll('td-race-lane')];
    f.componentRef.setInput('lanes', [lane('b', 1), lane('a', 2)]);
    await f.whenStable();
    const after = [...el.querySelectorAll('td-race-lane')];
    expect(after[0]).toBe(laneB);
    expect(after[1]).toBe(laneA);
  });

  it('starts a horse with no progress entry at the start line', async () => {
    const f = await render([lane('a', 1)], {});
    expect((f.nativeElement as HTMLElement).querySelector<HTMLElement>('.runner')!.style.left).toBe('0%');
  });

  it('marks the last lane for kerb art', async () => {
    const f = await render([lane('a', 1), lane('b', 2), lane('c', 3)], {});
    const lanes = [...(f.nativeElement as HTMLElement).querySelectorAll('.lane')];
    expect(lanes.map((l) => l.classList.contains('last'))).toEqual([false, false, true]);
  });
});
