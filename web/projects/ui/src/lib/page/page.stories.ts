import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { Page } from './page';
import { Loader } from '../loader/loader';
import { ThemePicker } from '../theme/theme-picker';

const meta: Meta = {
  title: 'Components/Page',
  parameters: { layout: 'fullscreen' },
  decorators: [moduleMetadata({ imports: [Page, Loader, ThemePicker] })],
};
export default meta;

/** The page frame with a header slot; the loader centres itself in the body. */
export const Loading: StoryObj = {
  render: () => ({
    template: `<div style="height:100vh;display:flex;flex-direction:column"><td-page><div tdPageHeader style="padding:12px"><td-theme-picker /></div><td-loader /></td-page></div>`,
  }),
};
