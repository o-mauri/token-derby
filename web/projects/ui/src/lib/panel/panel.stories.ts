import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Panel } from './panel';

const meta: Meta<Panel> = {
  title: 'Layout/Panel',
  component: Panel,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] })],
  parameters: { layout: 'padded' },
  render: (args) => ({
    props: args,
    template: `<td-panel [spine]="spine" [link]="link" [disabled]="disabled" style="height:220px">
      <p style="margin:0">Panel content goes here.</p></td-panel>`,
  }),
  args: { spine: 'RACES', link: null, disabled: false },
};
export default meta;

/** Hover or tab to it: the border lights up, and it opens like any link (new tab included). */
export const Linked: StoryObj<Panel> = { args: { link: ['/org', 'acme', 'races'] } };
export const Plain: StoryObj<Panel> = { args: { spine: 'LEAGUE' } };
/** Not available yet, e.g. Market. */
export const Disabled: StoryObj<Panel> = { args: { spine: 'MARKET', disabled: true } };
/** Under 700px wide the spine becomes a heading. */
export const Narrow: StoryObj<Panel> = { args: { link: ['/x'] }, decorators: [(s) => ({ ...s(), template: `<div style="width:360px">${s().template}</div>` })] };
