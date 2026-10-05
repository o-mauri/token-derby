import type { Meta, StoryObj } from '@storybook/angular-vite';
import { RaceLane } from './lane';
import type { LaneView } from '../models';

const LANE: LaneView = {
  id: 'h1', name: 'Thunderhoof', owner: 'omar',
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  hat: { id: 'stetson' }, tokens: 1234567, level: 7, pace: 4321, position: 1, league: null,
  stamina: { value: 72, band: 'high' },
};

const meta: Meta<RaceLane> = {
  title: 'Race/Lane',
  component: RaceLane,
  parameters: { layout: 'fullscreen' },
  args: { lane: LANE, progress: 55, state: 'live', index: 0, last: false },
  argTypes: { progress: { control: { type: 'range', min: 0, max: 100, step: 0.5 } }, state: { control: 'inline-radio', options: ['pending', 'live', 'finished'] } },
  render: (args) => ({ props: args, template: `<div style="padding:40px 12px 24px"><td-race-lane [lane]="lane" [progress]="progress" [state]="state" [index]="index" [last]="last" /></div>` }),
};
export default meta;

/** Drag `progress` in the controls to move the horse along the lane. */
export const Live: StoryObj<RaceLane> = {};
export const Pending: StoryObj<RaceLane> = { args: { state: 'pending', progress: 0 } };
export const Finished: StoryObj<RaceLane> = { args: { state: 'finished', progress: 100 } };
export const TiredHorse: StoryObj<RaceLane> = { args: { lane: { ...LANE, stamina: { value: 9, band: 'low' }, position: 4 }, progress: 38 } };
export const NoStamina: StoryObj<RaceLane> = { args: { lane: { ...LANE, stamina: null } } };
export const League: StoryObj<RaceLane> = { args: { lane: { ...LANE, league: { rank: 1, division: 'Gold' } } } };
export const LegendaryHat: StoryObj<RaceLane> = { args: { lane: { ...LANE, hat: { id: 'rainbow_crown' } } } };
