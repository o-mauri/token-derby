import { TestBed } from '@angular/core/testing';
import { StatusChip } from './status-chip';
import type { LaneState } from '../models';

async function render(status: LaneState | null) {
  const f = TestBed.createComponent(StatusChip);
  f.componentRef.setInput('status', status);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('StatusChip', () => {
  it('shows the race state, styled by state', async () => {
    for (const s of ['pending', 'live', 'finished'] as const) {
      const el = await render(s);
      expect(el.textContent?.trim()).toBe(s);
      expect(el.classList.contains(s)).toBe(true);
    }
  });

  it('only shows the on-air dot while live', async () => {
    expect((await render('live')).querySelector('.dot')).not.toBeNull();
    expect((await render('pending')).querySelector('.dot')).toBeNull();
  });

  it('shows a dash before the first poll', async () => {
    const el = await render(null);
    expect(el.textContent?.trim()).toBe('—');
    expect(el.classList.contains('unknown')).toBe(true);
  });
});
