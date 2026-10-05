import type { Meta, StoryObj } from '@storybook/angular-vite';
import { raceFixture } from './fixture';
import { RaceChart } from './race-chart';

const { series, horses } = raceFixture(8);
const meta: Meta<RaceChart> = {
  title: 'Race/Graphs/Race chart',
  component: RaceChart,
  parameters: { layout: 'padded' },
  args: { mode: 'cumulative', series, horses, endMs: null },
  argTypes: { mode: { control: 'inline-radio', options: ['cumulative', 'throughput'] } },
  render: (args) => ({ props: args, template: `<div style="height:440px;display:flex"><td-race-chart style="flex:1" [mode]="mode" [series]="series" [horses]="horses" [endMs]="endMs" /></div>` }),
};
export default meta;

/** Scored distance over the race, one smooth line per horse in rank order. Resize the window: it re-fits its width. */
export const Cumulative: StoryObj<RaceChart> = {};
/** Raw production per minute, smoothed over 30 minutes. */
export const Pace: StoryObj<RaceChart> = { args: { mode: 'throughput' } };
/** A live race charted up to "now" (an hour in), instead of running flat to the scheduled end. */
export const LiveSoFar: StoryObj<RaceChart> = { args: { endMs: series.start_ms + 60 * 60_000 } };
export const NoDataYet: StoryObj<RaceChart> = { args: { series: { ...series, horses: series.horses.map((h) => ({ ...h, points: [] })) } } };
/** While the series loads, the chart shows the porthole loader (after its 250ms grace period). */
export const Loading: StoryObj<RaceChart> = { args: { series: null } };
