import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StaminaBar } from './stamina-bar';

const meta: Meta<StaminaBar> = {
  title: 'Race/Stamina bar',
  component: StaminaBar,
  args: { value: 80, band: 'high' },
  argTypes: { band: { control: 'inline-radio', options: ['high', 'mid', 'low'] }, value: { control: { type: 'range', min: 0, max: 100 } } },
  render: (args) => ({ props: args, template: `<div style="transform:scale(4);transform-origin:left top;padding:4px"><td-stamina-bar [value]="value" [band]="band" /></div>` }),
};
export default meta;

export const High: StoryObj<StaminaBar> = {};
export const Mid: StoryObj<StaminaBar> = { args: { value: 35, band: 'mid' } };
export const Low: StoryObj<StaminaBar> = { args: { value: 8, band: 'low' } };
export const Empty: StoryObj<StaminaBar> = { args: { value: 0, band: 'low' } };
