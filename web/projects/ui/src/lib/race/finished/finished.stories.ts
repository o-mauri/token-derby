import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { TimedTab } from '../../timed-tabs/timed-tabs';
import { Finished } from './finished';
import { finishedField } from './fixture';

const placeholder = (text: string) =>
  `<div style="display:grid;place-items:center;height:100%;min-height:180px;color:var(--td-text-muted)">${text}</div>`;

const meta: Meta<Finished> = {
  title: 'Race/Finished/Screen',
  component: Finished,
  decorators: [moduleMetadata({ imports: [TimedTab] })],
  parameters: { layout: 'fullscreen' },
  args: { raceName: 'Preview Derby', results: finishedField(19), perPage: 8, interval: 10_000 },
  render: (args) => ({
    props: args,
    template: `<div style="height:100vh">
      <td-finished [raceName]="raceName" [results]="results" [perPage]="perPage" [interval]="interval">
        <ng-template tdTab label="Cumulative tokens">${placeholder('Cumulative tokens chart: arrives with the race chart in phase 5')}</ng-template>
        <ng-template tdTab label="Pace">${placeholder('Pace chart: arrives with the race chart in phase 5')}</ng-template>
      </td-finished></div>`,
  }),
};
export default meta;

/** The full screen at TV size: confetti on arrival, the podium, then the board pages and charts taking 10s turns. */
export const BigField: StoryObj<Finished> = {};
export const SmallField: StoryObj<Finished> = { args: { results: finishedField(6) } };
/** Phone width: everything stacks and the tab row scrolls. */
export const Phone: StoryObj<Finished> = {
  render: (args) => ({
    props: args,
    template: `<div style="width:390px;height:844px;border:1px solid var(--td-border)"><td-finished [raceName]="raceName" [results]="results" [perPage]="perPage" /></div>`,
  }),
};
