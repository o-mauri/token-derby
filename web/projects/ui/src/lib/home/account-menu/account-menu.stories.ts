import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { AccountMenu } from './account-menu';

const meta: Meta<AccountMenu> = {
  title: 'Home/Account menu',
  component: AccountMenu,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  args: { name: 'Omar', meLink: null, accountLink: null },
};
export default meta;
type S = StoryObj<AccountMenu>;

export const SoonItems: S = {};
export const Linked: S = { args: { meLink: ['/me'], accountLink: ['/account'] } };
export const LongName: S = { args: { name: 'Bartholomew Featherstonehaugh' } };
