import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, RouterLink, withDisabledInitialNavigation } from '@angular/router';
import { Button } from './button';

const meta: Meta = {
  title: 'Components/Button',
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [Button, RouterLink] })],
};
export default meta;

export const Default: StoryObj = { render: () => ({ template: `<button td-button>Join race</button>` }) };
export const AsLink: StoryObj = { render: () => ({ template: `<a td-button routerLink="/">← Home</a>` }) };
/** Faded and inert, e.g. the division arrows at either end. */
export const Disabled: StoryObj = { render: () => ({ template: `<button td-button disabled>Join race</button> <button td-button size="sm" disabled>‹</button>` }) };
