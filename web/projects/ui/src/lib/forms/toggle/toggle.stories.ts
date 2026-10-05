import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Toggle } from './toggle';

const meta: Meta<Toggle> = {
  title: 'Forms/Toggle',
  component: Toggle,
  args: { label: 'Stamina', checked: false, disabled: false },
  argTypes: { checkedChange: { action: 'checkedChange' } },
};
export default meta;

export const Off: StoryObj<Toggle> = {};
export const On: StoryObj<Toggle> = { args: { checked: true } };
export const Disabled: StoryObj<Toggle> = { args: { checked: true, disabled: true } };
