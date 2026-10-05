import type { Meta, StoryObj } from '@storybook/angular-vite';
import { applicationConfig, moduleMetadata } from '@storybook/angular-vite';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { MonthPager } from '../month-pager/month-pager';
import { RACES_VIEW, runner } from '../fixture';
import { RaceList } from './race-list';

const AT = { atMs: Date.now(), timeLeftSeconds: 2 * 3600 + 14 * 60 };
const LIVE = { code: 'K7QX', name: 'Friday Sprint', leader: runner('Gallopz', 'dana', 'brown', 4_210_000, { id: 'cowboy_hat' }), tokens: 4_210_000, runners: 12, anchor: AT };
const UP = [
  { code: 'P2LM', name: 'Friday Sprint', startsAt: '', date: 'Fri 3 Oct', time: '09:00', startsIn: 'in 1d 14h', anchor: { atMs: Date.now(), timeLeftSeconds: 38 * 3600 } },
  { code: 'Q8RT', name: 'Monday Mile', startsAt: '', date: 'Mon 6 Oct', time: '09:00', startsIn: 'in 4d 14h', anchor: { atMs: Date.now(), timeLeftSeconds: 110 * 3600 } },
];

const meta: Meta<RaceList> = {
  title: 'Org/Race list',
  component: RaceList,
  decorators: [applicationConfig({ providers: [provideRouter([], withDisabledInitialNavigation())] }), moduleMetadata({ imports: [MonthPager] })],
  parameters: { layout: 'padded' },
  args: { live: LIVE, upcoming: UP, results: RACES_VIEW.latest },
  render: (args) => ({
    props: args,
    template: `<td-race-list [live]="live" [upcoming]="upcoming" [results]="results">
      <td-month-pager label="SEPTEMBER 2026" [count]="results.length" [prev]="{ key: '2026-08', label: 'August' }" [next]="null" />
    </td-race-list>`,
  }),
};
export default meta;

/** Hover or tab through: every row is a link to its race. */
export const Default: StoryObj<RaceList> = {};
export const NoLiveOrUpcoming: StoryObj<RaceList> = { args: { live: null, upcoming: [] } };
/** Before the API reports field sizes and totals. */
export const NoTotalsYet: StoryObj<RaceList> = { args: { results: RACES_VIEW.latest.map((r) => ({ ...r, runners: null, total: null })) } };
