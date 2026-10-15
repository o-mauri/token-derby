import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Panel } from '../../panel/panel';
import { LEAGUE_VIEW } from '../fixture';
import { LeaguePanel } from './league-panel';

const meta: Meta<LeaguePanel> = {
  title: 'Org/League panel',
  component: LeaguePanel,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [Panel] })],
  parameters: { layout: 'padded' },
  args: { view: LEAGUE_VIEW },
  render: (args) => ({ props: args, template: `<td-panel spine="LEAGUE" style="height:260px;max-width:960px"><td-org-league-panel [view]="view" /></td-panel>` }),
};
export default meta;
type S = StoryObj<LeaguePanel>;

export const Default: S = {};
/** A taller panel fits more of each division. */
export const Tall: S = { render: (args) => ({ props: args, template: `<td-panel spine="LEAGUE" style="height:440px;max-width:960px"><td-org-league-panel [view]="view" /></td-panel>` }) };
export const MoreDivisions: S = { args: { view: { ...LEAGUE_VIEW!, moreDivisions: 2 } } };
export const NoLeague: S = { args: { view: null }, render: (args) => ({ props: args, template: `<td-panel spine="LEAGUE" disabled style="height:260px;max-width:960px"><td-org-league-panel [view]="view" /></td-panel>` }) };
