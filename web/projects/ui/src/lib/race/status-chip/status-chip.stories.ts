import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StatusChip } from './status-chip';

const meta: Meta<StatusChip> = {
  title: 'Race/Status chip',
  component: StatusChip,
  args: { status: 'live' },
  argTypes: { status: { control: 'inline-radio', options: ['pending', 'live', 'finished', null] } },
};
export default meta;

/** Live gets a pulsing on-air dot; it holds steady under reduced motion. */
export const Live: StoryObj<StatusChip> = {};
export const Pending: StoryObj<StatusChip> = { args: { status: 'pending' } };
export const Finished: StoryObj<StatusChip> = { args: { status: 'finished' } };
export const Unknown: StoryObj<StatusChip> = { args: { status: null } };
