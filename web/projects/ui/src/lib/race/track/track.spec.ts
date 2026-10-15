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

  it('marks itself scrolled once it leaves the top, so lanes stop drawing over the crowd', async () => {
    const f = await render([lane('a', 1)], {});
    const host = f.nativeElement as HTMLElement;
    expect(host.classList.contains('scrolled')).toBe(false);
    host.scrollTop = 40;
    host.dispatchEvent(new Event('scroll'));
    await f.whenStable();
    expect(host.classList.contains('scrolled')).toBe(true);
    host.scrollTop = 0;
    host.dispatchEvent(new Event('scroll'));
    await f.whenStable();
    expect(host.classList.contains('scrolled')).toBe(false);
  });

  describe('inspecting a horse', () => {
    const hit = (el: HTMLElement, i: number) => el.querySelectorAll<HTMLElement>('td-race-lane .hit')[i]!;
    const pointer = (type: string, pointerType = 'mouse') => Object.assign(new Event(type), { pointerType });
    const card = (el: HTMLElement) => el.querySelector('td-horse-card .name')?.textContent?.trim() ?? null;

    it('shows the card and the nose line while a horse is hovered, and hides them after', async () => {
      const f = await render([lane('a', 1), lane('b', 2)], { a: 60, b: 30 });
      const el = f.nativeElement as HTMLElement;
      expect(card(el)).toBeNull();

      hit(el, 1).dispatchEvent(pointer('pointerenter'));
      await f.whenStable();
      expect(card(el)).toBe('Horse b');
      const line = el.querySelector<HTMLElement>('.nose-line')!;
      expect(line.style.getPropertyValue('--p')).toBe('30');
      expect(line.textContent?.trim()).toBe('2ND');

      hit(el, 1).dispatchEvent(pointer('pointerleave'));
      await f.whenStable();
      expect(card(el)).toBeNull();
      expect(el.querySelector('.nose-line')).toBeNull();
    });

    it('opens the card on the horse\'s left once it is past the middle of the track', async () => {
      const f = await render([lane('a', 1), lane('b', 2)], { a: 80, b: 30 });
      const el = f.nativeElement as HTMLElement;
      hit(el, 0).dispatchEvent(pointer('pointerenter'));
      await f.whenStable();
      expect(el.querySelector('td-horse-card')!.classList).toContain('flip');
    });

    it('ignores touch hovers, and pins the card on a tap until a click elsewhere', async () => {
      const f = await render([lane('a', 1), lane('b', 2)], { a: 60, b: 30 });
      const el = f.nativeElement as HTMLElement;
      document.body.appendChild(el);

      hit(el, 0).dispatchEvent(pointer('pointerenter', 'touch'));
      await f.whenStable();
      expect(card(el)).toBeNull();

      hit(el, 0).click();
      await f.whenStable();
      expect(card(el)).toBe('Horse a');
      hit(el, 0).dispatchEvent(pointer('pointerleave', 'touch'));
      await f.whenStable();
      expect(card(el)).toBe('Horse a');

      document.body.click();
      await f.whenStable();
      expect(card(el)).toBeNull();
      el.remove();
    });

    it('closes a pinned card when the same horse is tapped again', async () => {
      const f = await render([lane('a', 1), lane('b', 2)], {});
      const el = f.nativeElement as HTMLElement;
      hit(el, 0).click();
      await f.whenStable();
      hit(el, 0).click();
      await f.whenStable();
      expect(card(el)).toBeNull();
    });
  });
});
