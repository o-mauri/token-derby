import { TestBed } from '@angular/core/testing';
import { DivisionLadder, type LadderValue } from './division-ladder';

const THREE: LadderValue = {
  divisions: [{ name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }, { name: 'League One', cap: 8 }],
  boundaries: [2, 2],
};

async function render(value: LadderValue, error: string | null = null) {
  const f = TestBed.createComponent(DivisionLadder);
  f.componentInstance.value.set(value);
  f.componentRef.setInput('error', error);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const click = async (sel: string, i = 0) => { el.querySelectorAll<HTMLButtonElement>(sel)[i]!.click(); await f.whenStable(); };
  const type = async (sel: string, i: number, v: string) => {
    const box = el.querySelectorAll(sel)[i]!.querySelector('input')!;
    box.value = v;
    box.dispatchEvent(new Event('input'));
    await f.whenStable();
  };
  return { f, el, click, type, value: () => f.componentInstance.value() };
}

describe('DivisionLadder', () => {
  it('lists divisions top to bottom with a swap between each pair, the last uncapped', async () => {
    const { el } = await render(THREE);
    expect(el.querySelectorAll('.division')).toHaveLength(3);
    expect(el.querySelectorAll('.swap')).toHaveLength(2);
    expect(el.querySelectorAll('.division')[2]!.textContent).toContain('no cap');
    expect(el.querySelectorAll('.division')[2]!.querySelector('td-text-input.cap')).toBeNull();
  });

  it('adds a division at the bottom, carrying a cap down and a default swap of 2', async () => {
    const d = await render(THREE);
    await d.click('button.add');
    expect(d.value().divisions).toHaveLength(4);
    expect(d.value().divisions[3]!.name).toBe('Division 4');
    expect(d.value().boundaries).toEqual([2, 2, 2]);
  });

  it('removes a middle division and the swap above it', async () => {
    const d = await render(THREE);
    await d.click('button.remove', 1);
    expect(d.value().divisions.map((x) => x.name)).toEqual(['Premier', 'League One']);
    expect(d.value().boundaries).toEqual([2]);
  });

  it('keeps at least one division', async () => {
    const { el } = await render({ divisions: [{ name: 'Only', cap: 8 }], boundaries: [] });
    expect(el.querySelector<HTMLButtonElement>('button.remove')!.disabled).toBe(true);
    expect(el.querySelector('.summary')?.textContent?.trim()).toBe('Everyone races in Only.');
  });

  it('edits caps, names and swaps', async () => {
    const d = await render(THREE);
    await d.type('td-text-input.cap', 0, '10');
    await d.type('td-text-input.name', 1, 'Second');
    await d.type('td-text-input.boundary', 1, '3');
    expect(d.value().divisions[0]!.cap).toBe(10);
    expect(d.value().divisions[1]!.name).toBe('Second');
    expect(d.value().boundaries).toEqual([2, 3]);
  });

  it('sums up where horses start', async () => {
    const { el } = await render(THREE);
    expect(el.querySelector('.summary')?.textContent?.trim()).toBe('16 horses fit in the top two; everyone else starts in League One.');
  });

  it('shows a validation message', async () => {
    const { el } = await render(THREE, 'division names must be 1-40 chars');
    expect(el.querySelector('.error')?.textContent).toContain('division names must be 1-40 chars');
  });
});
