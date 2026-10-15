import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Confirm } from './confirm';

const meta: Meta<Confirm> = {
  title: 'Dialog/Confirm',
  component: Confirm,
  parameters: { layout: 'padded' },
  args: { open: true, message: 'Revoke old-laptop?', detail: 'It will need token-derby login again. You stay signed in here.', confirmLabel: 'Revoke', tone: 'danger' },
  render: (args) => ({ props: args, template: `<div style="position:relative;height:280px;border:1px dashed #444"><td-confirm [open]="open" [message]="message" [detail]="detail" [confirmLabel]="confirmLabel" [tone]="tone" /></div>` }),
};
export default meta;
type S = StoryObj<Confirm>;
export const Danger: S = {};
export const Normal: S = { args: { tone: 'normal', message: 'Switch to a league?', detail: 'This replaces the weekly schedule.', confirmLabel: 'Switch' } };
