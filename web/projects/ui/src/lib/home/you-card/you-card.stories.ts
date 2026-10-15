import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { YouCard } from './you-card';

const meta: Meta<YouCard> = {
  title: 'Home/You card',
  component: YouCard,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  args: { name: 'Omar', link: ['/me'], colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' }, hat: null },
  render: (args) => ({ props: args, template: `<td-you-card [name]="name" [link]="link" [colors]="colors" [hat]="hat" style="width:18rem" />` }),
};
export default meta;
type S = StoryObj<YouCard>;

export const Linked: S = {};
export const ComingSoon: S = { args: { link: null, colors: null } };
export const LongName: S = { args: { name: 'Bartholomew Featherstonehaugh' } };
