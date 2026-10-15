import type { Meta, StoryObj } from '@storybook/angular-vite';
import { NotFound } from './not-found';

const meta: Meta<NotFound> = {
  title: 'Components/NotFound',
  component: NotFound,
  argTypes: { back: { action: 'back' } },
  args: {
    title: 'Race not found',
    message: ['No race with the code ', { strong: 'ABC123' }, '. It may have been typed wrong.'],
    backLabel: '← Home',
  },
};
export default meta;

export const Default: StoryObj<NotFound> = {};
export const LongTypedValue: StoryObj<NotFound> = {
  args: { title: 'Org not found', message: ["There's no org called ", { strong: 'averyveryverylongorgname' }, '.'] },
};
export const UnknownRoute: StoryObj<NotFound> = {
  args: { title: 'Page not found', message: ["There's nothing at this address."] },
};
