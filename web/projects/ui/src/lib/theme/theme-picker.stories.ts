import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ThemePicker } from './theme-picker';

const meta: Meta<ThemePicker> = { title: 'Components/ThemePicker', component: ThemePicker };
export default meta;

/** Changes the live theme, the same as the toolbar. */
export const Default: StoryObj<ThemePicker> = {};
