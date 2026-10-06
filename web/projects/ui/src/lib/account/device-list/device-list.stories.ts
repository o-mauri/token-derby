import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { DeviceRecord } from '@token-derby/shared';
import { DeviceList } from './device-list';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const device = (i: number, label: string, daysAgo: number): DeviceRecord => ({
  device_id: `d${i}`, label, created_at: new Date(NOW - (daysAgo + 30) * 86_400_000).toISOString(), last_seen_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
});

const meta: Meta<DeviceList> = {
  title: 'Account/Device list',
  component: DeviceList,
  parameters: { layout: 'padded' },
  args: { now: NOW, devices: [device(1, 'omar-mbp', 0.001), device(2, 'work-desktop', 1.2), device(3, 'old-laptop', 36)] },
  render: (args) => ({ props: args, template: `<td-device-list [devices]="devices" [now]="now" style="height:240px;max-width:40rem" />` }),
};
export default meta;
type S = StoryObj<DeviceList>;
export const Several: S = {};
export const Long: S = { args: { devices: Array.from({ length: 25 }, (_, i) => device(i, `machine-${i + 1}`, i * 3)) } };
export const OneDevice: S = { args: { devices: [device(1, 'omar-mbp', 0.001)] } };
