import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CodeInput } from './code-input';

const meta: Meta<CodeInput> = {
  title: 'Forms/Code input',
  component: CodeInput,
  parameters: { layout: 'padded' },
  args: { label: 'Code from your terminal', value: '' },
};
export default meta;
type S = StoryObj<CodeInput>;
export const Empty: S = {};
export const Filled: S = { args: { value: 'K7QX2M' } };
