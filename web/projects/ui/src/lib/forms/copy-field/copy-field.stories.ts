import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CopyField } from './copy-field';

const meta: Meta<CopyField> = {
  title: 'Forms/Copy field',
  component: CopyField,
  args: { label: 'Join token', value: 'tdj_8f3k29xq7m1p' },
  argTypes: { copied: { action: 'copied' } },
};
export default meta;

export const Default: StoryObj<CopyField> = {};
