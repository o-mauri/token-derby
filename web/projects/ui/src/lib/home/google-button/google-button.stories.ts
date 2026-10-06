import type { Meta, StoryObj } from '@storybook/angular-vite';
import { GoogleButton } from './google-button';

const meta: Meta<GoogleButton> = {
  title: 'Home/Google button',
  component: GoogleButton,
  parameters: { layout: 'padded' },
  args: { href: '#' },
};
export default meta;
type S = StoryObj<GoogleButton>;

export const Default: S = {};
