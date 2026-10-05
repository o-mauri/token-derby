import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Countdown } from './countdown';

const meta: Meta<Countdown> = {
  title: 'Race/Countdown',
  component: Countdown,
  args: { anchor: { atMs: Date.now(), timeLeftSeconds: 3725 } },
  render: (args) => ({ props: args, template: `<span style="font-size:var(--td-text-xl)"><td-countdown [anchor]="anchor" /></span>` }),
};
export default meta;

/** Ticks down every second from the last poll's anchor. */
export const Running: StoryObj<Countdown> = {};
export const Done: StoryObj<Countdown> = { args: { anchor: { atMs: Date.now(), timeLeftSeconds: 0 } } };
export const NoDataYet: StoryObj<Countdown> = { args: { anchor: null } };
