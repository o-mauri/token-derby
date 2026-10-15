import type { Meta, StoryObj } from '@storybook/angular-vite';
import { VersionSwitch } from './version-switch';

const meta: Meta<VersionSwitch> = {
  title: 'UI/Version switch',
  component: VersionSwitch,
  args: { on: true },
  argTypes: { switched: { action: 'switched' } },
};
export default meta;

/** On v2: pressing asks to go back to the classic site. */
export const On: StoryObj<VersionSwitch> = {};
/** On v1: pressing asks to try the new site. */
export const Off: StoryObj<VersionSwitch> = { args: { on: false } };
