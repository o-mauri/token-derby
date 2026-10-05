import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Panel } from '../../panel/panel';
import { LIVE_VIEW, NEXT_VIEW } from '../fixture';
import { LivePanel } from './live-panel';

const meta: Meta<LivePanel> = {
  title: 'Org/Live panel',
  component: LivePanel,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [Panel] })],
  parameters: { layout: 'padded' },
  render: (args) => ({ props: args, template: `<td-panel [spine]="view.kind === 'next' ? 'NEXT' : 'LIVE'" [link]="['/race', 'K7QX']" style="height:260px"><td-org-live-panel [view]="view" /></td-panel>` }),
};
export default meta;
type S = StoryObj<LivePanel>;

export const Live: S = { args: { view: LIVE_VIEW } };
export const Next: S = { args: { view: NEXT_VIEW } };
export const NoRace: S = { args: { view: { kind: 'none' } } };
/** The live race's details failed to load: the summary's name and countdown still show. */
export const LiveWithoutDetails: S = { args: { view: { ...LIVE_VIEW, leader: null, chasers: [], runners: null } } };
/** 40-character names (the limit) and a long league race name: they scroll, and owners give way first. */
export const LongNames: S = { args: { view: { ...LIVE_VIEW, name: 'Anthropic Summer Championship (League Race (4/8))',
  leader: { ...LIVE_VIEW.leader!, name: 'Sir Gallopsalot the Magnificent Steed Jr' },
  chasers: LIVE_VIEW.chasers.map((c, i) => (i === 0 ? { ...c, name: 'Neigh Sayer of the Northern Downs III' } : c)) } } };
