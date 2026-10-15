import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Crumbs } from './crumbs';

const meta: Meta<Crumbs> = {
  title: 'Layout/Crumbs',
  component: Crumbs,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  args: { parts: [{ label: 'Acme', link: ['/org', 'acme'] }, { label: 'League' }] },
};
export default meta;
type S = StoryObj<Crumbs>;
export const TwoSteps: S = {};
export const OneStep: S = { args: { parts: [{ label: 'Stackone' }] } };
export const LongName: S = { args: { parts: [{ label: 'Bartholomew Featherstonehaugh' }, { label: 'Account' }] } };
