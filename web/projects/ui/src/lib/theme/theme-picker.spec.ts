import { TestBed } from '@angular/core/testing';
import { ThemePicker } from './theme-picker';
import { ThemeService } from './theme.service';
import { THEMES } from './themes';

describe('ThemePicker', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows the current theme on a td-select trigger', async () => {
    const f = TestBed.createComponent(ThemePicker);
    await f.whenStable();
    const current = THEMES.find((t) => t.id === TestBed.inject(ThemeService).theme())!;
    const trigger = (f.nativeElement as HTMLElement).querySelector('td-select button')!;
    expect(trigger.textContent).toContain(current.label);
  });

  it('lists every theme in order and sets the one chosen', async () => {
    const f = TestBed.createComponent(ThemePicker);
    await f.whenStable();
    (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('td-select button')!.click();
    await f.whenStable();
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(THEMES.map((t) => t.label));
    options.find((o) => o.textContent?.trim() === 'Turf')!.click();
    await f.whenStable();
    expect(TestBed.inject(ThemeService).theme()).toBe('turf');
  });
});
