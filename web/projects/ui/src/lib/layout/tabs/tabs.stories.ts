import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Tabs } from './tabs';

const meta: Meta<Tabs> = {
  title: 'Layout/Tabs',
  component: Tabs,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  args: { label: 'Account', tabs: [{ label: 'Profile', link: ['/'] }, { label: 'Devices', link: ['/devices'] }] },
};
export default meta;
export const TwoTabs: StoryObj<Tabs> = {};
