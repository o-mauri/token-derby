import { TestBed } from '@angular/core/testing';
import { HorseChip, type HorseChipLeague } from './horse-chip';

type Inputs = Partial<{ name: string; owner: string; tokens: number; level: number; pace: number | null; position: number; league: HorseChipLeague }>;

async function render(extra: Inputs = {}) {
  const f = TestBed.createComponent(HorseChip);
  const inputs: Inputs = { name: 'Thunderhoof', owner: 'omar', tokens: 1234567, level: 7, pace: 4321, position: 1, ...extra };
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  await f.whenStable();
  return { f, el: f.nativeElement as HTMLElement };
}

const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.trim();

describe('HorseChip', () => {
  it('shows the name and the formatted token total', async () => {
    const { el } = await render();
    expect(text(el, '.name')).toBe('Thunderhoof');
    expect(text(el, '.tokens')).toBe('1,234,567 tok');
  });

  it('cycles owner, level, pace and position views', async () => {
    const { el } = await render();
    const views = [...el.querySelectorAll('.stats .view')].map((v) => v.textContent?.trim());
    expect(views).toEqual(['omar', 'Lvl. 7', '+4,321/min', '1st']);
    expect(el.querySelector('.stats')!.classList.contains('league')).toBe(false);
  });

  it('shows a dash when there is no pace yet', async () => {
    const { el } = await render({ pace: null });
    expect(text(el, '.pace')).toBe('—');
  });

  it('colours the top three as medals and the rest as plain places', async () => {
    for (const [position, cls] of [[1, 'gold'], [2, 'silver'], [3, 'bronze'], [4, 'place']] as const) {
      const { el } = await render({ position });
      expect(el.querySelector('.position')!.classList.contains(cls)).toBe(true);
    }
  });

  it('adds a fifth view with the division position on league lanes', async () => {
    const { el } = await render({ league: { rank: 2, division: 'Gold' } });
    expect(el.querySelector('.stats')!.classList.contains('league')).toBe(true);
    expect(text(el, '.league-pos')).toBe('2nd (Gold)');
    expect(el.querySelectorAll('.stats .view').length).toBe(5);
  });

  it('keeps the owner view for legacy horses so the cycle timing holds', async () => {
    const { el } = await render({ owner: '' });
    expect(el.querySelectorAll('.stats .view').length).toBe(4);
    expect(text(el, '.owner')).toBe('');
  });

  it('renders a hostile name as text', async () => {
    const { el } = await render({ name: '<img src=x onerror=alert(1)>' });
    expect(el.querySelector('img')).toBeNull();
    expect(text(el, '.name')).toBe('<img src=x onerror=alert(1)>');
  });
});
