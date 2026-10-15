import { DOCUMENT, inject } from '@angular/core';
import type { DeviceRecord, ListDevicesResponse } from '@token-derby/shared';
import { MemoryStorage } from '../session/memory-storage';
import { SESSION_KEYS } from '../session/session-storage';

const params = () => new URLSearchParams(inject(DOCUMENT).defaultView?.location.search ?? '');

/** A seeded session: ?signed=out for none, &linked=no to drop the email. */
export function previewAccountStorage(): Storage {
  const p = params();
  if (p.get('signed') === 'out') return new MemoryStorage();
  return new MemoryStorage({
    [SESSION_KEYS.token]: 'preview', [SESSION_KEYS.uid]: 'u1', [SESSION_KEYS.name]: 'Omar',
    ...(p.get('linked') === 'no' ? {} : { [SESSION_KEYS.email]: 'omar@stackone.com' }),
  });
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;
const LABELS = ['omar-mbp', 'work-desktop', 'old-laptop', 'build-box', 'pi-in-the-cupboard', 'studio-imac', 'travel-air', 'linux-tower'];

export type DevicesVariant = 'some' | 'none' | 'many' | 'failed';

export function devicesVariant(): DevicesVariant {
  const v = params().get('devices');
  return v === 'none' || v === 'many' || v === 'failed' ? v : 'some';
}

export function previewDevices(variant: DevicesVariant): ListDevicesResponse {
  const count = variant === 'none' ? 0 : variant === 'many' ? 24 : 3;
  const devices: DeviceRecord[] = Array.from({ length: count }, (_, i) => ({
    device_id: `d${i}`,
    label: count > 3 ? `${LABELS[i % LABELS.length]}-${Math.floor(i / LABELS.length) + 1}` : LABELS[i]!,
    created_at: ago((i * 9 + 30) * DAY),
    last_seen_at: ago(i === 0 ? 2 * 60_000 : i * 5 * DAY),
  }));
  return { devices, has_legacy_credential: params().has('legacy') };
}
