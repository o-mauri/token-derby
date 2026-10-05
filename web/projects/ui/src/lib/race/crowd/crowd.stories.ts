import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Crowd } from './crowd';

const meta: Meta<Crowd> = {
  title: 'Race/Crowd',
  component: Crowd,
  parameters: { layout: 'fullscreen' },
  args: { paused: false },
  render: (args) => ({ props: args, template: `<div style="padding-top:var(--td-space-6)"><td-crowd [paused]="paused" /></div>` }),
};
export default meta;

/** Every spectator cheers on its own beat. Resize the window: the crowd grows without re-rolling who is mid-cheer.
 *  Switch to London for the bridge, skyline and passing bus; Phosphor or Matrix tint it green. */
export const Cheering: StoryObj<Crowd> = {};
/** Once the race is over the crowd freezes. */
export const Paused: StoryObj<Crowd> = { args: { paused: true } };
