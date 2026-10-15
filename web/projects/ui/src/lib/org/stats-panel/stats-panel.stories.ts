import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { Panel } from '../../panel/panel';
import { STATS_VIEW } from '../fixture';
import { StatsPanel } from './stats-panel';

const meta: Meta<StatsPanel> = {
  title: 'Org/Stats panel',
  component: StatsPanel,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [Panel] })],
  parameters: { layout: 'padded' },
  args: { view: STATS_VIEW },
  render: (args) => ({ props: args, template: `<td-panel spine="STATS" style="height:260px;max-width:620px"><td-org-stats-panel [view]="view" /></td-panel>` }),
};
export default meta;
type S = StoryObj<StatsPanel>;

export const Default: S = {};
/** Before the API reports race totals. */
export const NoTotalsYet: S = { args: { view: { ...STATS_VIEW, totalTokens: null, lastTen: Array(10).fill(null) } } };
export const NoFinishedRaces: S = { args: { view: { racesRun: 0, mostWins: null, totalTokens: 0, lastTen: [] } } };
