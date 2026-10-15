import type { Meta, StoryObj } from '@storybook/angular';
import { ThemeBackdrop } from './theme-backdrop';

const meta: Meta<ThemeBackdrop> = {
  title: 'Theme/Backdrop',
  component: ThemeBackdrop,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Page-wide weather. Pick London or Matrix in the toolbar to see it; other themes show nothing.' } } },
  render: () => ({ template: `<td-theme-backdrop /><p style="position:relative;z-index:1;padding:24px">Page content sits here.</p>` }),
};
export default meta;
export const Default: StoryObj<ThemeBackdrop> = {};
