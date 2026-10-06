import { TestBed } from '@angular/core/testing';
import type { DeviceRecord } from '@token-derby/shared';
import { DeviceList } from './device-list';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const DEVICES: DeviceRecord[] = [
  { device_id: 'd1', label: 'omar-mbp', created_at: '2026-09-12T10:00:00Z', last_seen_at: '2026-10-06T11:58:00Z' },
  { device_id: 'd2', label: 'old-laptop', created_at: '2026-08-01T10:00:00Z', last_seen_at: '2026-09-01T10:00:00Z' },
];

async function render(devices: DeviceRecord[]) {
  const f = TestBed.createComponent(DeviceList);
  f.componentRef.setInput('devices', devices);
  f.componentRef.setInput('now', NOW);
  const revoked: DeviceRecord[] = [];
  f.componentInstance.revoke.subscribe((d) => revoked.push(d));
  await f.whenStable();
  return { el: f.nativeElement as HTMLElement, revoked };
}

describe('DeviceList', () => {
  it('lists devices with relative dates and the full date on hover', async () => {
    const { el } = await render(DEVICES);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('omar-mbp');
    const seen = rows[0]!.querySelector('.seen')!;
    expect(seen.textContent?.trim()).toBe('2 min ago');
    expect(seen.getAttribute('title')).toBeTruthy();
  });

  it('emits the device to revoke', async () => {
    const { el, revoked } = await render(DEVICES);
    el.querySelectorAll<HTMLButtonElement>('button.revoke')[1]!.click();
    expect(revoked.map((d) => d.device_id)).toEqual(['d2']);
  });

  it('names each revoke button for screen readers', async () => {
    const { el } = await render(DEVICES);
    expect(el.querySelector('button.revoke')?.getAttribute('aria-label')).toBe('Revoke omar-mbp');
  });

  it('renders no table for no devices', async () => {
    const { el } = await render([]);
    expect(el.querySelector('table')).toBeNull();
  });
});
