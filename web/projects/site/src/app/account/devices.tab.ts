import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DeviceRecord } from '@token-derby/shared';
import { Confirm, DeviceList, Loader, pollResource } from '@token-derby/ui';
import { AccountApi } from './account-api';

/** Your CLI devices, each revocable after an in-page confirm. */
@Component({
  selector: 'site-devices-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Confirm, DeviceList, Loader],
  host: { 'data-tab': 'devices' },
  templateUrl: './devices.tab.html',
  styleUrl: './devices.tab.scss',
})
export class DevicesTab {
  private readonly api = inject(AccountApi);

  protected readonly now = Date.now();
  protected readonly list = pollResource({ params: () => true, loader: () => this.api.devices(), intervalMs: 3_600_000, until: () => true });
  private readonly removed = signal<ReadonlySet<string>>(new Set());
  protected readonly shown = computed(() => (this.list.value()?.devices ?? []).filter((d) => !this.removed().has(d.device_id)));
  protected readonly loaded = computed(() => this.list.value() !== undefined);
  protected readonly pending = signal<DeviceRecord | null>(null);
  protected readonly revokeError = signal<string | null>(null);

  protected ask(device: DeviceRecord): void {
    this.revokeError.set(null);
    this.pending.set(device);
  }

  protected async revoke(): Promise<void> {
    const device = this.pending();
    this.pending.set(null);
    if (!device) return;
    try {
      await this.api.revokeDevice(device.device_id);
      this.removed.update((s) => new Set([...s, device.device_id]));
    } catch {
      this.revokeError.set(`Couldn't revoke ${device.label}. Try again.`);
    }
  }
}
