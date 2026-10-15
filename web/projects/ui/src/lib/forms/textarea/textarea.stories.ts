import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Textarea } from './textarea';

const meta: Meta<Textarea> = {
  title: 'Forms/Textarea',
  component: Textarea,
  args: { label: 'Announcement', value: 'Race starts at 9am sharp. Bring your best prompts.', rows: 4, disabled: false },
  argTypes: { valueChange: { action: 'valueChange' } },
  decorators: [(story) => ({ ...story(), template: `<div style="width:360px"><td-textarea [label]="label" [value]="value" [rows]="rows" [disabled]="disabled" (valueChange)="valueChange($event)" /></div>` })],
};
export default meta;

export const Default: StoryObj<Textarea> = {};
export const Disabled: StoryObj<Textarea> = { args: { disabled: true } };
