import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Segmented } from './segmented';

const MODES = [{ value: 'schedule', label: 'Schedule' }, { value: 'league', label: 'League' }, { value: 'off', label: 'Off' }];

const meta: Meta<Segmented<string>> = {
  title: 'Forms/Segmented',
  component: Segmented,
  args: { label: 'Racing mode', options: MODES, value: 'schedule', disabled: false },
  argTypes: { valueChange: { action: 'valueChange' } },
};
export default meta;

export const Default: StoryObj<Segmented<string>> = {};
export const Disabled: StoryObj<Segmented<string>> = { args: { disabled: true } };
