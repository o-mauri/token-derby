import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Panel } from '../../panel/panel';
import { RACES_VIEW } from '../fixture';
import { RacesPanel } from './races-panel';

const meta: Meta<RacesPanel> = {
  title: 'Org/Races panel',
  component: RacesPanel,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [Panel] })],
  parameters: { layout: 'padded' },
  args: { view: RACES_VIEW },
  render: (args) => ({ props: args, template: `<td-panel spine="RACES" [link]="['/org', 'acme', 'races']" style="height:260px;max-width:960px"><td-org-races-panel [view]="view" /></td-panel>` }),
};
export default meta;
type S = StoryObj<RacesPanel>;

export const Default: S = {};
export const NothingUpcoming: S = { args: { view: { ...RACES_VIEW, next: null } } };
export const NoTotalsYet: S = { args: { view: { ...RACES_VIEW, latest: RACES_VIEW.latest.map((r) => ({ ...r, runners: null, total: null })) } } };
