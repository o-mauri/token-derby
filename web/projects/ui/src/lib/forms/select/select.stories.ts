import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Select } from './select';

const LEAGUES = [
  { value: 'spring', label: 'Spring cup' },
  { value: 'summer', label: 'Summer derby' },
  { value: 'autumn', label: 'Autumn stakes' },
  { value: 'winter', label: 'Winter classic' },
];

const meta: Meta<Select<string>> = {
  title: 'Forms/Select',
  component: Select,
  args: { label: 'League', options: LEAGUES, value: 'summer', disabled: false },
  argTypes: { valueChange: { action: 'valueChange' } },
};
export default meta;

export const Default: StoryObj<Select<string>> = {};
export const Placeholder: StoryObj<Select<string>> = { args: { value: null, placeholder: 'Pick a league' } };
export const Disabled: StoryObj<Select<string>> = { args: { disabled: true } };
export const WithError: StoryObj<Select<string>> = {
  args: { value: null, touched: true, errors: [{ kind: 'required', message: 'Choose a league' }] as never },
};
