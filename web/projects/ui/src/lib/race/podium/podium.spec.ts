import { TestBed } from '@angular/core/testing';
import { Podium } from './podium';
import type { FinishView } from '../models';

export const finish = (position: number, name: string, tokens: number, extra: Partial<FinishView> = {}): FinishView => ({
  id: name.toLowerCase(), position, name, owner: `${name}'s owner`,
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, hat: null,
  tokens, behind: position === 1 ? null : 4280 - tokens, xpBefore: 60, xpAwarded: 30, ...extra,
});

async function render(top: FinishView[]) {
  const f = TestBed.createComponent(Podium);
  f.componentRef.setInput('top', top);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('Podium', () => {
  const TOP = [finish(1, 'Stormbringer', 4280, { hat: { id: 'stetson' } }), finish(2, 'Pegasus', 3915), finish(3, 'Cloudrunner', 3502)];

  it('stands the winner in the middle, 2nd on the left and 3rd on the right', async () => {
    const el = await render(TOP);
    const names = [...el.querySelectorAll('.place .name')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['2 · Pegasus', '1 · Stormbringer', '3 · Cloudrunner']);
    expect(el.querySelector('.place.winner .name')?.textContent).toContain('Stormbringer');
  });

  it('colours each place by its medal and shows tokens, owner and the gap behind', async () => {
    const el = await render(TOP);
    const places = [...el.querySelectorAll('.place')];
    expect(places.map((p) => ['gold', 'silver', 'bronze'].find((c) => p.classList.contains(c)))).toEqual(['silver', 'gold', 'bronze']);
    expect(places[0]!.querySelector('.tokens')?.textContent).toBe('3,915');
    expect(places[0]!.querySelector('.behind')?.textContent).toBe('−365');
    expect(places[1]!.querySelector('.behind')).toBeNull();
    expect(places[1]!.querySelector('.owner')?.textContent).toBe("Stormbringer's owner");
  });

  it('draws each horse standing still, wearing its hat, with its XP bar captioned', async () => {
    const el = await render(TOP);
    const winner = el.querySelector('.place.winner')!;
    expect(winner.querySelector('td-horse')!.classList.contains('running')).toBe(false);
    expect(winner.querySelector('td-horse .horse-hat-stetson')).not.toBeNull();
    expect(winner.querySelector('td-xp-bar .caption')).not.toBeNull();
  });

  it('copes with a field of fewer than three', async () => {
    const el = await render(TOP.slice(0, 2));
    expect([...el.querySelectorAll('.place .name')].map((n) => n.textContent?.trim())).toEqual(['2 · Pegasus', '1 · Stormbringer']);
  });
});
