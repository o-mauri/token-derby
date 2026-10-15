import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DeviceRecord } from '@token-derby/shared';
import { relativeTime } from '../../format/relative-time';

/** Your CLI devices: when each was added and last seen, with a Revoke button. Scrolls inside the space it's given. */
@Component({
  selector: 'td-device-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (devices().length) {
      <div class="scroll">
        <table>
          <thead><tr><th scope="col">Device</th><th scope="col">Added</th><th scope="col">Last seen</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>
            @for (d of devices(); track d.device_id) {
              <tr>
                <td class="label">{{ d.label }}</td>
                <td class="added" [title]="full(d.created_at)">{{ ago(d.created_at) }}</td>
                <td class="seen" [title]="full(d.last_seen_at)">{{ ago(d.last_seen_at) }}</td>
                <td><button type="button" class="revoke" [attr.aria-label]="'Revoke ' + d.label" (click)="revoke.emit(d)">Revoke</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styleUrl: './device-list.scss',
})
export class DeviceList {
  readonly devices = input.required<readonly DeviceRecord[]>();
  readonly now = input.required<number>();
  readonly revoke = output<DeviceRecord>();

  protected ago(iso: string): string {
    return relativeTime(iso, this.now());
  }

  protected full(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}
