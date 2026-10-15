import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TextInput } from './text-input';

const meta: Meta<TextInput> = {
  title: 'Forms/Text input',
  component: TextInput,
  args: { label: 'Webhook URL', placeholder: 'https://…', value: '', type: 'text', disabled: false },
  argTypes: { valueChange: { action: 'valueChange' }, type: { control: 'inline-radio', options: ['text', 'number', 'password'] } },
  decorators: [(story) => ({ ...story(), template: `<div style="width:320px">${story().template ?? '<td-text-input [label]="label" [placeholder]="placeholder" [value]="value" [type]="type" [disabled]="disabled" [touched]="touched" [errors]="errors" (valueChange)="valueChange($event)" />'}</div>` })],
};
export default meta;

export const Empty: StoryObj<TextInput> = {};
export const Filled: StoryObj<TextInput> = { args: { value: 'https://hooks.slack.com/services/T000/B000' } };
export const Number: StoryObj<TextInput> = { args: { label: 'Race length (hours)', type: 'number', value: 8 } };
export const Password: StoryObj<TextInput> = { args: { label: 'Admin password', type: 'password', value: 'hunter22' } };
export const Disabled: StoryObj<TextInput> = { args: { value: 'Owner only', disabled: true } };
export const WithError: StoryObj<TextInput> = {
  args: { value: 'not a url', touched: true, errors: [{ kind: 'pattern', message: 'Enter a full https:// address' }] as never },
};
