import type { Meta, StoryObj } from '@storybook/angular-vite';
import { moduleMetadata } from '@storybook/angular-vite';
import { TimedTab, TimedTabs } from './timed-tabs';

const meta: Meta<TimedTabs> = {
  title: 'Components/Timed tabs',
  component: TimedTabs,
  decorators: [moduleMetadata({ imports: [TimedTab] })],
  parameters: { layout: 'padded' },
  args: { interval: 4000, paused: false },
  argTypes: { selectedChange: { action: 'selectedChange' } },
  render: (args) => ({
    props: args,
    template: `
      <td-timed-tabs [interval]="interval" [paused]="paused" (selectedChange)="selectedChange($event)" style="height:220px">
        @for (v of ['Board 4–11', 'Board 12–19', 'Cumulative tokens', 'Pace', 'Season']; track v) {
          <ng-template tdTab [label]="v">
            <div style="display:grid;place-items:center;height:160px;font-size:var(--td-text-xl);color:var(--td-text-muted)">{{ v }}</div>
          </ng-template>
        }
      </td-timed-tabs>`,
  }),
};
export default meta;

/** Moves on by itself (every 4s here, 10s by default). Click or use the arrow keys to jump, hover to pause, swipe on touch. */
export const Default: StoryObj<TimedTabs> = {};
export const Paused: StoryObj<TimedTabs> = { args: { paused: true } };
/** On a phone the tab row scrolls sideways rather than wrapping. */
export const PhoneWidth: StoryObj<TimedTabs> = { parameters: { viewport: { defaultViewport: 'phone' } }, decorators: [(s) => ({ ...s(), template: `<div style="width:340px">${s().template}</div>` })] };
