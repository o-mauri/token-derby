import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ChipGroup } from './chip-group';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ value: i + 1, label }));

const meta: Meta<ChipGroup<number>> = {
  title: 'Forms/Chip group',
  component: ChipGroup,
  args: { label: 'Race days', options: DAYS, value: [1, 3, 5], disabled: false },
  argTypes: { valueChange: { action: 'valueChange' } },
};
export default meta;

export const Weekdays: StoryObj<ChipGroup<number>> = {};
export const Disabled: StoryObj<ChipGroup<number>> = { args: { disabled: true } };
