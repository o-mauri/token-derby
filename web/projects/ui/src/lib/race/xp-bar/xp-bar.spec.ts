import { TestBed } from '@angular/core/testing';
import { XpBar } from './xp-bar';

async function render(xpBefore: number, xpAwarded: number, extra: Record<string, unknown> = {}) {
  const f = TestBed.createComponent(XpBar);
  for (const [k, v] of Object.entries({ xpBefore, xpAwarded, ...extra })) f.componentRef.setInput(k, v);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('XpBar', () => {
  it('shows the level, XP gained and the bar for a horse that stayed on its level', async () => {
    const el = await render(60, 80);
    expect(el.querySelector('.pill')!.textContent?.replace(/\s+/g, ' ').trim()).toBe('Lvl. 2');
    expect(el.querySelector('.gained')!.textContent?.trim()).toBe('+80 XP');
    expect(el.querySelector('.uptag')).toBeNull();
    expect(el.classList.contains('nolv')).toBe(true);
    const fill = el.querySelector<HTMLElement>('.capsule')!;
    expect(fill.style.getPropertyValue('--o')).toBe(String((10 / 117) * 100));
    expect(fill.style.getPropertyValue('--n')).toBe(String((90 / 117) * 100));
  });

  it('ticks the level over and tags a level up', async () => {
    const el = await render(140, 40);
    expect(el.classList.contains('lvup')).toBe(true);
    expect(el.querySelector('.pill .before')!.textContent).toBe('Lvl. 2');
    expect(el.querySelector('.pill .after')!.textContent).toBe('Lvl. 3');
    expect(el.querySelector('.uptag')!.textContent?.trim()).toBe('LEVEL UP');
  });

  it('captions the progress into the level when asked, and the max level plainly', async () => {
    expect((await render(140, 40, { caption: true })).querySelector('.caption')!.textContent?.trim()).toBe('13 / 174 XP');
    expect((await render(99_000, 999, { caption: true })).querySelector('.caption')!.textContent?.trim()).toBe('Max level');
    expect((await render(140, 40)).querySelector('.caption')).toBeNull();
  });

  it('describes itself for screen readers', async () => {
    const el = await render(140, 40);
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Level 3, up from level 2. Gained 40 XP; 13 of 174 XP into the level.');
  });

  it('has a compact size for board rows', async () => {
    expect((await render(60, 80, { size: 'sm' })).classList.contains('sm')).toBe(true);
  });
});
